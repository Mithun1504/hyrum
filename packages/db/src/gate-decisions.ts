import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import {
  apiServices,
  assertionConsumers,
  assertions,
  auditEvents,
  breakingChangeImpacts,
  captureSessions,
  claimEvidence,
  deltaAssertionMatches,
  deltaClaimMatches,
  dependencyClaims,
  gateDecisions,
  gateExceptions,
  gateImpacts,
  gatePolicyVersions,
  jobs,
  ledgerEntries,
  memberships,
  notifications,
  organizationKeyVersions,
  outboxEvents,
  receipts,
  redactionPolicyVersions,
  replayRuns,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";

export const DECISION_ENGINE_VERSION = "deterministic-gate-v1";

type GateOutcome = "block" | "warn" | "note" | "pass";
type GateDecisionOutcome = GateOutcome | "error" | "cancelled";
type EvidenceTier = "t1" | "t2" | "t3";

export interface ReplayDeltaTarget {
  replayDeltaId: string;
  consumerId: string;
  behaviorDefinitionId: string;
  assertionId: string | null;
  stability: "stable" | "flaky";
}

export interface GateDecisionRecord {
  id: string;
  outcome: GateDecisionOutcome;
  blockingImpactCount: number;
  warningImpactCount: number;
  notedImpactCount: number;
  decisionDigest: string;
}

interface ReplayDeltaTargetRow extends Record<string, unknown> {
  replay_delta_id: string;
  consumer_id: string;
  behavior_definition_id: string;
  assertion_id: string | null;
  stability: "stable" | "flaky";
}

interface ProposedImpact {
  replayDeltaId: string;
  consumerId: string;
  dependencyClaimId: string | null;
  assertionId: string | null;
  effectiveTier: EvidenceTier | null;
  action: GateOutcome;
  gateExceptionId: string | null;
  receiptId: string | null;
  reasonCode: string;
  behaviorDefinitionId: string;
}

const outcomeRank: Record<GateOutcome, number> = { pass: 0, note: 1, warn: 2, block: 3 };

function strongestOutcome(outcomes: GateOutcome[]): GateOutcome {
  return outcomes.reduce<GateOutcome>(
    (strongest, current) => (outcomeRank[current] > outcomeRank[strongest] ? current : strongest),
    "pass",
  );
}

function policyAction(value: string, allowed: readonly GateOutcome[], field: string): GateOutcome {
  if (!allowed.includes(value as GateOutcome)) {
    throw new Error(`Gate policy ${field} contains an invalid action`);
  }
  return value as GateOutcome;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Load only exact, persisted claim/assertion matches for this immutable run. */
export async function loadReplayGateTargets(
  tx: DatabaseTransaction,
  organizationId: string,
  replayRunId: string,
): Promise<ReplayDeltaTarget[]> {
  const rows = await tx.execute<ReplayDeltaTargetRow>(sql`
    select targets.replay_delta_id, targets.consumer_id, targets.behavior_definition_id,
           max(targets.assertion_id::text)::uuid as assertion_id, targets.stability
    from (
      select rd.id as replay_delta_id, c.consumer_id, c.behavior_definition_id,
             null::uuid as assertion_id, rd.stability
      from replay_deltas rd
      join delta_claim_matches dcm
        on dcm.organization_id = rd.organization_id and dcm.replay_delta_id = rd.id
       and dcm.matched and dcm.ineligibility_reason is null
      join dependency_claims c
        on c.organization_id = dcm.organization_id and c.id = dcm.dependency_claim_id
      where rd.organization_id = ${organizationId} and rd.replay_run_id = ${replayRunId}
      union all
      select rd.id, ci.consumer_id, a.behavior_definition_id, a.id, rd.stability
      from replay_deltas rd
      join delta_assertion_matches dam
        on dam.organization_id = rd.organization_id and dam.replay_delta_id = rd.id
       and dam.matched and dam.ineligibility_reason is null
      join assertions a
        on a.organization_id = dam.organization_id and a.id = dam.assertion_id
      join replay_runs rr
        on rr.organization_id = rd.organization_id and rr.id = rd.replay_run_id
      join corpus_items ci
        on ci.organization_id = rr.organization_id and ci.replay_corpus_id = rr.replay_corpus_id
       and ci.assertion_id = a.id and ci.api_operation_id = rd.api_operation_id
      where rd.organization_id = ${organizationId} and rd.replay_run_id = ${replayRunId}
    ) targets
    group by targets.replay_delta_id, targets.consumer_id,
             targets.behavior_definition_id, targets.stability
    order by targets.replay_delta_id, targets.consumer_id
  `);
  return rows.map((row) => ({
    replayDeltaId: row.replay_delta_id,
    consumerId: row.consumer_id,
    behaviorDefinitionId: row.behavior_definition_id,
    assertionId: row.assertion_id,
    stability: row.stability,
  }));
}

export function actionForGateTarget(input: {
  stability: "stable" | "flaky";
  tier: EvidenceTier | null;
  assertion: boolean;
  t1Eligible?: boolean;
  policy: {
    t1Action: GateOutcome;
    t2Action: GateOutcome;
    t3Action: GateOutcome;
    assertionAction: GateOutcome;
    flakyAction: GateOutcome;
  };
}): { action: GateOutcome; reasonCode: string } {
  if (input.stability === "flaky") {
    return { action: input.policy.flakyAction, reasonCode: "flaky_delta" };
  }
  if (input.assertion) {
    return { action: input.policy.assertionAction, reasonCode: "active_assertion" };
  }
  if (input.tier === "t1") {
    return input.t1Eligible
      ? { action: input.policy.t1Action, reasonCode: "eligible_t1_echo" }
      : { action: "warn", reasonCode: "t1_evidence_ineligible" };
  }
  if (input.tier === "t2") {
    return { action: input.policy.t2Action, reasonCode: "t2_pattern" };
  }
  return { action: input.policy.t3Action, reasonCode: "t3_exposure" };
}

async function findExactException(
  tx: DatabaseTransaction,
  organizationId: string,
  run: {
    apiServiceId: string;
    candidateImageDigest: string;
    githubRepositoryId: string | null;
    pullRequestId: string | null;
  },
  impact: ProposedImpact,
  evaluatedAt: Date,
): Promise<string | null> {
  const [exception] = await tx
    .select({ id: gateExceptions.id })
    .from(gateExceptions)
    .innerJoin(
      breakingChangeImpacts,
      and(
        eq(breakingChangeImpacts.organizationId, gateExceptions.organizationId),
        eq(breakingChangeImpacts.breakingChangePlanId, gateExceptions.breakingChangePlanId),
        eq(breakingChangeImpacts.consumerId, impact.consumerId),
      ),
    )
    .where(
      and(
        eq(gateExceptions.organizationId, organizationId),
        eq(gateExceptions.apiServiceId, run.apiServiceId),
        eq(gateExceptions.behaviorDefinitionId, impact.behaviorDefinitionId),
        eq(gateExceptions.candidateImageDigest, run.candidateImageDigest),
        eq(gateExceptions.status, "approved"),
        lte(gateExceptions.validFrom, evaluatedAt),
        gt(gateExceptions.validUntil, evaluatedAt),
        or(
          isNull(gateExceptions.githubRepositoryId),
          run.githubRepositoryId
            ? eq(gateExceptions.githubRepositoryId, run.githubRepositoryId)
            : undefined,
        ),
        or(
          isNull(gateExceptions.pullRequestId),
          run.pullRequestId ? eq(gateExceptions.pullRequestId, run.pullRequestId) : undefined,
        ),
      ),
    )
    .limit(1);
  return exception?.id ?? null;
}

export async function evaluateReplayGate(
  tx: DatabaseTransaction,
  organizationId: string,
  replayRunId: string,
  targets: ReplayDeltaTarget[],
  evaluatedAt: Date,
  requestId = `gate:${replayRunId}`,
): Promise<GateDecisionRecord> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${replayRunId}, 0))`);
  const [existing] = await tx
    .select({
      id: gateDecisions.id,
      outcome: gateDecisions.outcome,
      blockingImpactCount: gateDecisions.blockingImpactCount,
      warningImpactCount: gateDecisions.warningImpactCount,
      notedImpactCount: gateDecisions.notedImpactCount,
      decisionDigest: gateDecisions.decisionDigest,
    })
    .from(gateDecisions)
    .where(
      and(
        eq(gateDecisions.organizationId, organizationId),
        eq(gateDecisions.replayRunId, replayRunId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ...existing,
      outcome: policyAction(existing.outcome, ["block", "warn", "note", "pass"], "outcome"),
    };
  }
  const [run] = await tx
    .select({
      apiServiceId: replayRuns.apiServiceId,
      status: replayRuns.status,
      gatePolicyVersionId: replayRuns.gatePolicyVersionId,
      candidateImageDigest: replayRuns.candidateImageDigest,
      githubRepositoryId: replayRuns.githubRepositoryId,
      pullRequestId: replayRuns.pullRequestId,
      serviceSlug: apiServices.slug,
      t1Action: gatePolicyVersions.t1Action,
      t2Action: gatePolicyVersions.t2Action,
      t3Action: gatePolicyVersions.t3Action,
      assertionAction: gatePolicyVersions.assertionAction,
      flakyAction: gatePolicyVersions.flakyAction,
    })
    .from(replayRuns)
    .innerJoin(
      gatePolicyVersions,
      and(
        eq(gatePolicyVersions.organizationId, replayRuns.organizationId),
        eq(gatePolicyVersions.id, replayRuns.gatePolicyVersionId),
      ),
    )
    .innerJoin(
      apiServices,
      and(
        eq(apiServices.organizationId, replayRuns.organizationId),
        eq(apiServices.id, replayRuns.apiServiceId),
      ),
    )
    .where(and(eq(replayRuns.organizationId, organizationId), eq(replayRuns.id, replayRunId)))
    .limit(1);
  if (!run) throw new Error("Replay run policy is unavailable");
  if (run.status !== "succeeded") {
    throw new Error("Only a successfully verified replay can be evaluated");
  }
  const policy = {
    t1Action: policyAction(run.t1Action, ["block", "warn", "note"], "t1Action"),
    t2Action: policyAction(run.t2Action, ["warn", "note", "pass"], "t2Action"),
    t3Action: policyAction(run.t3Action, ["note", "pass"], "t3Action"),
    assertionAction: policyAction(
      run.assertionAction,
      ["block", "warn", "note"],
      "assertionAction",
    ),
    flakyAction: policyAction(run.flakyAction, ["warn", "note", "pass"], "flakyAction"),
  };

  const impacts: ProposedImpact[] = [];
  for (const target of targets) {
    const claimRows = await tx
      .select({
        id: dependencyClaims.id,
        tier: dependencyClaims.tier,
        deterministicEligible: dependencyClaims.deterministicEligible,
        effectiveFrom: dependencyClaims.effectiveFrom,
        effectiveUntil: dependencyClaims.effectiveUntil,
        freshnessStatus: ledgerEntries.freshnessStatus,
        receiptId: receipts.id,
        receiptType: receipts.receiptType,
        receiptAvailability: receipts.availabilityStatus,
        receiptExpiresAt: receipts.expiresAt,
        receiptCompleteness: receipts.completeness,
        receiptSequenceStart: receipts.sequenceStart,
        receiptSequenceEnd: receipts.sequenceEnd,
        sessionCompleteness: captureSessions.completeness,
        evidenceRole: claimEvidence.evidenceRole,
        responseSequenceNo: claimEvidence.responseSequenceNo,
        requestSequenceNo: claimEvidence.requestSequenceNo,
        valueHmac: claimEvidence.valueHmac,
        evidenceKeyId: claimEvidence.structuralHmacKeyVersionId,
        sessionKeyId: captureSessions.structuralHmacKeyVersionId,
        policyKeyId: redactionPolicyVersions.structuralHmacKeyVersionId,
        keyPurpose: organizationKeyVersions.purpose,
        keyStatus: organizationKeyVersions.status,
      })
      .from(deltaClaimMatches)
      .innerJoin(
        dependencyClaims,
        and(
          eq(dependencyClaims.organizationId, deltaClaimMatches.organizationId),
          eq(dependencyClaims.id, deltaClaimMatches.dependencyClaimId),
          eq(dependencyClaims.consumerId, target.consumerId),
          eq(dependencyClaims.status, "active"),
        ),
      )
      .innerJoin(
        ledgerEntries,
        and(
          eq(ledgerEntries.organizationId, dependencyClaims.organizationId),
          eq(ledgerEntries.dependencyClaimId, dependencyClaims.id),
        ),
      )
      .leftJoin(
        claimEvidence,
        and(
          eq(claimEvidence.organizationId, dependencyClaims.organizationId),
          eq(claimEvidence.dependencyClaimId, dependencyClaims.id),
          eq(claimEvidence.evidenceRole, "primary"),
        ),
      )
      .leftJoin(
        receipts,
        and(
          eq(receipts.organizationId, claimEvidence.organizationId),
          eq(receipts.id, claimEvidence.receiptId),
        ),
      )
      .leftJoin(
        captureSessions,
        and(
          eq(captureSessions.organizationId, receipts.organizationId),
          eq(captureSessions.id, receipts.captureSessionId),
        ),
      )
      .leftJoin(
        redactionPolicyVersions,
        and(
          eq(redactionPolicyVersions.organizationId, receipts.organizationId),
          eq(redactionPolicyVersions.id, receipts.redactionPolicyVersionId),
        ),
      )
      .leftJoin(
        organizationKeyVersions,
        and(
          eq(organizationKeyVersions.organizationId, claimEvidence.organizationId),
          eq(organizationKeyVersions.id, claimEvidence.structuralHmacKeyVersionId),
        ),
      )
      .where(
        and(
          eq(deltaClaimMatches.organizationId, organizationId),
          eq(deltaClaimMatches.replayDeltaId, target.replayDeltaId),
          eq(deltaClaimMatches.matched, true),
          isNull(deltaClaimMatches.ineligibilityReason),
        ),
      );

    const claims = new Map<string, (typeof claimRows)[number][]>();
    for (const row of claimRows) claims.set(row.id, [...(claims.get(row.id) ?? []), row]);
    for (const rows of claims.values()) {
      const claim = rows[0];
      if (!claim) continue;
      const temporallyEffective =
        claim.effectiveFrom <= evaluatedAt &&
        (claim.effectiveUntil === null || claim.effectiveUntil > evaluatedAt);
      if (!temporallyEffective) continue;
      const eligibleEvidence = rows.find(
        (row) =>
          row.tier === "t1" &&
          row.deterministicEligible &&
          (row.freshnessStatus === "fresh" || row.freshnessStatus === "aging") &&
          row.evidenceRole === "primary" &&
          row.receiptType === "t1_echo" &&
          row.receiptAvailability === "available" &&
          row.receiptExpiresAt !== null &&
          row.receiptExpiresAt > evaluatedAt &&
          row.receiptCompleteness === "complete" &&
          row.sessionCompleteness === "complete" &&
          row.responseSequenceNo !== null &&
          row.requestSequenceNo !== null &&
          row.requestSequenceNo > row.responseSequenceNo &&
          row.receiptSequenceStart !== null &&
          row.receiptSequenceEnd !== null &&
          row.responseSequenceNo >= row.receiptSequenceStart &&
          row.requestSequenceNo <= row.receiptSequenceEnd &&
          row.valueHmac !== null &&
          row.evidenceKeyId !== null &&
          row.evidenceKeyId === row.sessionKeyId &&
          row.evidenceKeyId === row.policyKeyId &&
          row.keyPurpose === "structural_hmac" &&
          (row.keyStatus === "active" || row.keyStatus === "retiring"),
      );
      const decision = actionForGateTarget({
        stability: target.stability,
        tier: claim.tier,
        assertion: false,
        t1Eligible: Boolean(eligibleEvidence),
        policy,
      });
      impacts.push({
        replayDeltaId: target.replayDeltaId,
        consumerId: target.consumerId,
        dependencyClaimId: claim.id,
        assertionId: null,
        effectiveTier: claim.tier,
        action: decision.action,
        gateExceptionId: null,
        receiptId: eligibleEvidence?.receiptId ?? null,
        reasonCode: decision.reasonCode,
        behaviorDefinitionId: target.behaviorDefinitionId,
      });
    }

    if (target.assertionId) {
      const [assertion] = await tx
        .select({
          id: assertions.id,
          status: assertions.status,
          scope: assertions.scope,
          startsAt: assertions.startsAt,
          expiresAt: assertions.expiresAt,
          selectedConsumerId: assertionConsumers.consumerId,
        })
        .from(deltaAssertionMatches)
        .innerJoin(
          assertions,
          and(
            eq(assertions.organizationId, deltaAssertionMatches.organizationId),
            eq(assertions.id, deltaAssertionMatches.assertionId),
          ),
        )
        .leftJoin(
          assertionConsumers,
          and(
            eq(assertionConsumers.organizationId, assertions.organizationId),
            eq(assertionConsumers.assertionId, assertions.id),
            eq(assertionConsumers.consumerId, target.consumerId),
          ),
        )
        .where(
          and(
            eq(deltaAssertionMatches.organizationId, organizationId),
            eq(deltaAssertionMatches.replayDeltaId, target.replayDeltaId),
            eq(deltaAssertionMatches.assertionId, target.assertionId),
            eq(deltaAssertionMatches.matched, true),
            isNull(deltaAssertionMatches.ineligibilityReason),
          ),
        )
        .limit(1);
      const assertionEffective =
        assertion &&
        (assertion.status === "active" || assertion.status === "expiring") &&
        assertion.startsAt <= evaluatedAt &&
        assertion.expiresAt > evaluatedAt &&
        (assertion.scope === "all_consumers" || assertion.selectedConsumerId === target.consumerId);
      if (assertionEffective) {
        const decision = actionForGateTarget({
          stability: target.stability,
          tier: null,
          assertion: true,
          policy,
        });
        impacts.push({
          replayDeltaId: target.replayDeltaId,
          consumerId: target.consumerId,
          dependencyClaimId: null,
          assertionId: assertion.id,
          effectiveTier: null,
          action: decision.action,
          gateExceptionId: null,
          receiptId: null,
          reasonCode: decision.reasonCode,
          behaviorDefinitionId: target.behaviorDefinitionId,
        });
      }
    }
  }

  for (const impact of impacts) {
    if (impact.action !== "block") continue;
    const exceptionId = await findExactException(tx, organizationId, run, impact, evaluatedAt);
    if (exceptionId) {
      impact.action = "warn";
      impact.gateExceptionId = exceptionId;
      impact.reasonCode = "approved_exact_exception";
    }
  }
  impacts.sort((left, right) =>
    [left.replayDeltaId, left.consumerId, left.dependencyClaimId ?? left.assertionId ?? ""]
      .join(":")
      .localeCompare(
        [
          right.replayDeltaId,
          right.consumerId,
          right.dependencyClaimId ?? right.assertionId ?? "",
        ].join(":"),
      ),
  );
  const outcome = strongestOutcome(impacts.map(({ action }) => action));
  const blockingImpactCount = impacts.filter(({ action }) => action === "block").length;
  const warningImpactCount = impacts.filter(({ action }) => action === "warn").length;
  const notedImpactCount = impacts.filter(({ action }) => action === "note").length;
  const decisionDigest = createHash("sha256")
    .update(
      stableJson({
        replayRunId,
        gatePolicyVersionId: run.gatePolicyVersionId,
        decisionEngineVersion: DECISION_ENGINE_VERSION,
        outcome,
        impacts: impacts.map(
          ({ behaviorDefinitionId: _behaviorDefinitionId, ...impact }) => impact,
        ),
      }),
    )
    .digest("hex");
  const [decision] = await tx
    .insert(gateDecisions)
    .values({
      organizationId,
      replayRunId,
      gatePolicyVersionId: run.gatePolicyVersionId,
      outcome,
      decisionEngineVersion: DECISION_ENGINE_VERSION,
      decisionDigest,
      blockingImpactCount,
      warningImpactCount,
      notedImpactCount,
      evaluatedAt,
    })
    .returning({ id: gateDecisions.id });
  if (!decision) throw new Error("Gate decision creation returned no record");
  if (impacts.length) {
    await tx.insert(gateImpacts).values(
      impacts.map((impact) => ({
        organizationId,
        gateDecisionId: decision.id,
        replayDeltaId: impact.replayDeltaId,
        consumerId: impact.consumerId,
        dependencyClaimId: impact.dependencyClaimId,
        assertionId: impact.assertionId,
        effectiveTier: impact.effectiveTier,
        action: impact.action,
        gateExceptionId: impact.gateExceptionId,
        receiptId: impact.receiptId,
        reasonCode: impact.reasonCode,
      })),
    );
  }
  const event = { gateDecisionId: decision.id, replayRunId, outcome };
  await Promise.all([
    tx.insert(auditEvents).values({
      organizationId,
      occurredAt: evaluatedAt,
      actorType: "system",
      action: "gate_decision.created",
      resourceType: "gate_decision",
      resourceId: decision.id,
      requestId,
      changes: {
        outcome,
        blockingImpactCount,
        warningImpactCount,
        notedImpactCount,
        decisionEngineVersion: DECISION_ENGINE_VERSION,
      },
      outcome: "succeeded",
    }),
    tx.insert(outboxEvents).values({
      organizationId,
      topic: "gate.decided",
      aggregateType: "gate_decision",
      aggregateId: decision.id,
      eventVersion: 1,
      payload: event,
      payloadDigest: createHash("sha256").update(stableJson(event)).digest("hex"),
    }),
  ]);
  if (run.githubRepositoryId && run.pullRequestId) {
    await tx.insert(jobs).values({
      organizationId,
      type: "publish_github_check",
      payload: { replayRunId },
      idempotencyKey: `publish-github-check:${replayRunId}`,
      concurrencyKey: `github-check:${run.githubRepositoryId}`,
      maxAttempts: 8,
    });
  }
  if (outcome === "block" || outcome === "warn") {
    const recipients = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "active")));
    const createdNotifications = recipients.length
      ? await tx
          .insert(notifications)
          .values(
            recipients.map(({ id: membershipId }) => ({
              organizationId,
              targetMembershipId: membershipId,
              apiServiceId: run.apiServiceId,
              replayRunId,
              gateDecisionId: decision.id,
              eventType: `gate.${outcome}`,
              severity: outcome === "block" ? ("critical" as const) : ("warning" as const),
              title:
                outcome === "block" ? "Replay gate blocked a change" : "Replay gate found warnings",
              bodyText:
                outcome === "block"
                  ? `${blockingImpactCount} deterministic impact${blockingImpactCount === 1 ? "" : "s"} require review.`
                  : `${warningImpactCount} compatibility warning${warningImpactCount === 1 ? "" : "s"} require review.`,
              deepLinkPath: `/app/${run.serviceSlug}/replays/${replayRunId}`,
              deduplicationKey: `gate:${decision.id}:membership:${membershipId}`,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: notifications.id })
      : [];
    const canonicalNotification = createdNotifications[0];
    if (canonicalNotification) {
      await tx.insert(jobs).values({
        organizationId,
        type: "route_notification",
        payload: { notificationId: canonicalNotification.id },
        idempotencyKey: `route-notification:gate:${decision.id}`,
        concurrencyKey: `notification:${organizationId}`,
        maxAttempts: 5,
      });
    }
  }
  return {
    id: decision.id,
    outcome,
    blockingImpactCount,
    warningImpactCount,
    notedImpactCount,
    decisionDigest,
  };
}
