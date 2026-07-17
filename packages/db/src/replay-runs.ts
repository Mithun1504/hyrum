import { createHash } from "node:crypto";
import type { CreateReplayRunRequest, ReplayReport } from "@hyrum/contracts";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { evaluateReplayGate, type ReplayDeltaTarget } from "./gate-decisions";
import type { Database, DatabaseClient } from "./index";
import {
  apiOperations,
  assertions,
  auditEvents,
  ciRunnerSessions,
  consumers,
  corpusItems,
  deltaAssertionMatches,
  deltaClaimMatches,
  dependencyClaims,
  extractorReleases,
  gateDecisions,
  gateImpacts,
  gatePolicies,
  gatePolicyVersions,
  githubRepositories,
  maskProfileVersions,
  organizations,
  outboxEvents,
  pullRequests,
  replayAttempts,
  replayCorpora,
  replayDeltas,
  replayProfiles,
  replayRuns,
  serviceRepositoryConnections,
  storedObjects,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface RunnerCredentialLookup {
  sessionId: string;
  organizationId: string;
  replayRunId: string;
  tokenHash: string;
  scopes: string[];
  nonceDigest: string;
  reportSigningPublicKey: string;
  signingKeyId: string;
}

export interface ReplayRunRecord {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  replayCorpusId: string;
  replayProfileId: string;
  baseImageDigest: string;
  candidateImageDigest: string;
  fixtureDigest: string;
  maskDigest: string;
  runnerVersion: string;
  startedAt: Date | null;
  completedAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
}

export class ReplayRunError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "ReplayRunError";
  }
}

const runProjection = {
  id: replayRuns.id,
  status: replayRuns.status,
  replayCorpusId: replayRuns.replayCorpusId,
  replayProfileId: replayRuns.replayProfileId,
  baseImageDigest: replayRuns.baseImageDigest,
  candidateImageDigest: replayRuns.candidateImageDigest,
  fixtureDigest: replayRuns.fixtureDigest,
  maskDigest: replayRuns.maskDigest,
  runnerVersion: replayRuns.runnerVersion,
  startedAt: replayRuns.startedAt,
  completedAt: replayRuns.completedAt,
  failureCode: replayRuns.failureCode,
  createdAt: replayRuns.createdAt,
};

export async function createReplayRun(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  actor: { userId: string; requestId: string },
  input: CreateReplayRunRequest,
  credential: { tokenPrefix: string; tokenHash: string; expiresAt: Date; nonceDigest: string },
): Promise<ReplayRunRecord> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${apiServiceId}, 0))`);
    const now = new Date();
    const [configuration] = await tx
      .select({
        corpusId: replayCorpora.id,
        corpusDigest: replayCorpora.corpusDigest,
        extractorReleaseId: replayCorpora.extractorReleaseId,
        environmentId: replayCorpora.environmentId,
        profileId: replayProfiles.id,
        fixtureObjectId: replayProfiles.fixtureObjectId,
        allowedOperationMode: replayProfiles.allowedOperationMode,
        maskDigest: maskProfileVersions.rulesDigest,
        gatePolicyVersionId: gatePolicyVersions.id,
        gatePolicyId: gatePolicies.id,
      })
      .from(replayCorpora)
      .innerJoin(
        replayProfiles,
        and(
          eq(replayProfiles.organizationId, replayCorpora.organizationId),
          eq(replayProfiles.apiServiceId, replayCorpora.apiServiceId),
          eq(replayProfiles.status, "active"),
        ),
      )
      .innerJoin(
        maskProfileVersions,
        and(
          eq(maskProfileVersions.organizationId, replayProfiles.organizationId),
          eq(maskProfileVersions.id, replayProfiles.maskProfileVersionId),
          eq(maskProfileVersions.status, "active"),
        ),
      )
      .innerJoin(
        gatePolicies,
        and(
          eq(gatePolicies.organizationId, replayCorpora.organizationId),
          eq(gatePolicies.apiServiceId, replayCorpora.apiServiceId),
          eq(gatePolicies.isDefault, true),
          isNull(gatePolicies.deletedAt),
        ),
      )
      .innerJoin(
        gatePolicyVersions,
        and(
          eq(gatePolicyVersions.organizationId, gatePolicies.organizationId),
          eq(gatePolicyVersions.gatePolicyId, gatePolicies.id),
          eq(gatePolicyVersions.status, "active"),
        ),
      )
      .where(
        and(
          eq(replayCorpora.organizationId, organizationId),
          eq(replayCorpora.apiServiceId, apiServiceId),
          eq(replayCorpora.id, input.replayCorpusId),
          eq(replayCorpora.status, "ready"),
          gt(replayCorpora.expiresAt, now),
        ),
      )
      .limit(1);
    if (!configuration)
      throw new ReplayRunError("not_found", "Replay configuration is unavailable");
    let githubContext: { githubRepositoryId: string; pullRequestId: string } | null = null;
    if (input.repositoryConnectionId && input.pullRequestNumber) {
      const [linkedPullRequest] = await tx
        .select({
          githubRepositoryId: githubRepositories.id,
          pullRequestId: pullRequests.id,
          isFork: pullRequests.isFork,
          state: pullRequests.state,
          replayProfileId: serviceRepositoryConnections.replayProfileId,
          gatePolicyId: serviceRepositoryConnections.gatePolicyId,
        })
        .from(serviceRepositoryConnections)
        .innerJoin(
          githubRepositories,
          and(
            eq(githubRepositories.organizationId, serviceRepositoryConnections.organizationId),
            eq(githubRepositories.id, serviceRepositoryConnections.githubRepositoryId),
            eq(githubRepositories.active, true),
            isNull(githubRepositories.deletedAt),
          ),
        )
        .innerJoin(
          pullRequests,
          and(
            eq(pullRequests.organizationId, githubRepositories.organizationId),
            eq(pullRequests.githubRepositoryId, githubRepositories.id),
            eq(pullRequests.number, input.pullRequestNumber),
          ),
        )
        .where(
          and(
            eq(serviceRepositoryConnections.organizationId, organizationId),
            eq(serviceRepositoryConnections.id, input.repositoryConnectionId),
            eq(serviceRepositoryConnections.apiServiceId, apiServiceId),
            eq(serviceRepositoryConnections.active, true),
            isNull(serviceRepositoryConnections.deletedAt),
          ),
        )
        .limit(1);
      if (!linkedPullRequest) {
        throw new ReplayRunError("not_found", "Connected pull request is unavailable");
      }
      if (linkedPullRequest.isFork) {
        throw new ReplayRunError("invalid", "Fork pull requests cannot receive runner credentials");
      }
      if (linkedPullRequest.state !== "open") {
        throw new ReplayRunError("invalid", "Only an open pull request can trigger a replay");
      }
      if (linkedPullRequest.replayProfileId !== configuration.profileId) {
        throw new ReplayRunError(
          "conflict",
          "Repository connection uses a superseded replay profile",
        );
      }
      if (linkedPullRequest.gatePolicyId !== configuration.gatePolicyId) {
        throw new ReplayRunError("conflict", "Repository connection uses a superseded gate policy");
      }
      githubContext = {
        githubRepositoryId: linkedPullRequest.githubRepositoryId,
        pullRequestId: linkedPullRequest.pullRequestId,
      };
    }
    const [unsafe] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(corpusItems)
      .where(
        and(
          eq(corpusItems.organizationId, organizationId),
          eq(corpusItems.replayCorpusId, configuration.corpusId),
          eq(corpusItems.requiresFixture, true),
        ),
      );
    if ((unsafe?.count ?? 0) > 0 && !configuration.fixtureObjectId) {
      throw new ReplayRunError("invalid", "Write-path corpus items require a disposable fixture");
    }
    if ((unsafe?.count ?? 0) > 0 && configuration.allowedOperationMode !== "explicit_writes") {
      throw new ReplayRunError(
        "invalid",
        "The active replay profile does not permit fixture-backed writes",
      );
    }
    let fixtureDigest = "none";
    if (configuration.fixtureObjectId) {
      const [fixture] = await tx
        .select({ digest: storedObjects.sha256Digest })
        .from(storedObjects)
        .where(
          and(
            eq(storedObjects.organizationId, organizationId),
            eq(storedObjects.id, configuration.fixtureObjectId),
            eq(storedObjects.availabilityStatus, "available"),
            isNull(storedObjects.deletedAt),
          ),
        )
        .limit(1);
      if (!fixture) throw new ReplayRunError("invalid", "Replay fixture is unavailable");
      fixtureDigest = fixture.digest;
    }
    const [created] = await tx
      .insert(replayRuns)
      .values({
        organizationId,
        apiServiceId,
        environmentId: configuration.environmentId,
        replayCorpusId: configuration.corpusId,
        replayProfileId: configuration.profileId,
        extractorReleaseId: configuration.extractorReleaseId,
        gatePolicyVersionId: configuration.gatePolicyVersionId,
        triggerType: githubContext ? "pull_request" : "manual",
        triggerIdempotencyKey: input.triggerIdempotencyKey,
        baseImageDigest: input.baseImageDigest,
        candidateImageDigest: input.candidateImageDigest,
        fixtureDigest,
        maskDigest: configuration.maskDigest,
        runnerVersion: input.runnerVersion,
        githubRepositoryId: githubContext?.githubRepositoryId,
        pullRequestId: githubContext?.pullRequestId,
        requestedByActorType: "user",
        requestedByActorId: actor.userId,
      })
      .returning(runProjection);
    if (!created) throw new ReplayRunError("conflict", "An identical replay run already exists");
    await Promise.all([
      tx.insert(replayAttempts).values({
        organizationId,
        replayRunId: created.id,
        attemptNumber: 1,
      }),
      tx.insert(ciRunnerSessions).values({
        organizationId,
        replayRunId: created.id,
        tokenPrefix: credential.tokenPrefix,
        tokenHash: credential.tokenHash,
        scopes: ["corpus:read", "report:write"],
        nonceDigest: credential.nonceDigest,
        reportSigningPublicKey: input.reportSigningPublicKey,
        signingKeyId: input.signingKeyId,
        expiresAt: credential.expiresAt,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "replay_run.created",
        resourceType: "replay_run",
        resourceId: created.id,
        requestId: actor.requestId,
        changes: {
          corpusDigest: configuration.corpusDigest,
          baseImageDigest: input.baseImageDigest,
          candidateImageDigest: input.candidateImageDigest,
        },
        outcome: "succeeded",
      }),
    ]);
    return created;
  });
}

export async function listReplayRuns(
  db: Database,
  organizationId: string,
  apiServiceId: string,
): Promise<
  Array<
    ReplayRunRecord & {
      gateDecision: null | {
        id: string;
        outcome: "block" | "warn" | "note" | "pass";
        decisionEngineVersion: string;
        blockingImpactCount: number;
        warningImpactCount: number;
        notedImpactCount: number;
        evaluatedAt: Date;
        impacts: Array<{
          id: string;
          replayDeltaId: string;
          consumerId: string;
          consumerAlias: string;
          dependencyClaimId: string | null;
          assertionId: string | null;
          effectiveTier: "t1" | "t2" | "t3" | null;
          kind: "shape" | "ordering" | "error_template";
          stability: "pending" | "stable" | "flaky" | "quarantined";
          action: "block" | "warn" | "note" | "pass";
          reasonCode: string;
          receiptId: string | null;
          gateExceptionId: string | null;
        }>;
      };
    }
  >
> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const runs = await tx
      .select(runProjection)
      .from(replayRuns)
      .where(
        and(
          eq(replayRuns.organizationId, organizationId),
          eq(replayRuns.apiServiceId, apiServiceId),
        ),
      )
      .orderBy(desc(replayRuns.createdAt))
      .limit(100);
    if (!runs.length) return [];
    const decisions = await tx
      .select({
        id: gateDecisions.id,
        replayRunId: gateDecisions.replayRunId,
        outcome: gateDecisions.outcome,
        decisionEngineVersion: gateDecisions.decisionEngineVersion,
        blockingImpactCount: gateDecisions.blockingImpactCount,
        warningImpactCount: gateDecisions.warningImpactCount,
        notedImpactCount: gateDecisions.notedImpactCount,
        evaluatedAt: gateDecisions.evaluatedAt,
      })
      .from(gateDecisions)
      .where(
        and(
          eq(gateDecisions.organizationId, organizationId),
          inArray(
            gateDecisions.replayRunId,
            runs.map(({ id }) => id),
          ),
        ),
      );
    const impacts = decisions.length
      ? await tx
          .select({
            id: gateImpacts.id,
            gateDecisionId: gateImpacts.gateDecisionId,
            replayDeltaId: gateImpacts.replayDeltaId,
            consumerId: gateImpacts.consumerId,
            consumerAlias: consumers.displayAlias,
            dependencyClaimId: gateImpacts.dependencyClaimId,
            assertionId: gateImpacts.assertionId,
            effectiveTier: gateImpacts.effectiveTier,
            kind: replayDeltas.kind,
            stability: replayDeltas.stability,
            action: gateImpacts.action,
            reasonCode: gateImpacts.reasonCode,
            receiptId: gateImpacts.receiptId,
            gateExceptionId: gateImpacts.gateExceptionId,
          })
          .from(gateImpacts)
          .innerJoin(
            consumers,
            and(
              eq(consumers.organizationId, gateImpacts.organizationId),
              eq(consumers.id, gateImpacts.consumerId),
            ),
          )
          .innerJoin(
            replayDeltas,
            and(
              eq(replayDeltas.organizationId, gateImpacts.organizationId),
              eq(replayDeltas.id, gateImpacts.replayDeltaId),
            ),
          )
          .where(
            and(
              eq(gateImpacts.organizationId, organizationId),
              inArray(
                gateImpacts.gateDecisionId,
                decisions.map(({ id }) => id),
              ),
            ),
          )
      : [];
    const decisionByRun = new Map(
      decisions.map((decision) => [
        decision.replayRunId,
        {
          ...decision,
          outcome: policyGateOutcome(decision.outcome),
          impacts: impacts
            .filter(({ gateDecisionId }) => gateDecisionId === decision.id)
            .map(({ gateDecisionId: _gateDecisionId, ...impact }) => ({
              ...impact,
              stability: policyDeltaStability(impact.stability),
              action: policyGateOutcome(impact.action),
            })),
        },
      ]),
    );
    return runs.map((run) => ({ ...run, gateDecision: decisionByRun.get(run.id) ?? null }));
  });
}

export async function getReplayRunDetail(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  replayRunId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [run] = await tx
      .select(runProjection)
      .from(replayRuns)
      .where(
        and(
          eq(replayRuns.organizationId, organizationId),
          eq(replayRuns.apiServiceId, apiServiceId),
          eq(replayRuns.id, replayRunId),
        ),
      )
      .limit(1);
    if (!run) return null;
    const [decision] = await tx
      .select({
        id: gateDecisions.id,
        outcome: gateDecisions.outcome,
        blockingImpactCount: gateDecisions.blockingImpactCount,
        warningImpactCount: gateDecisions.warningImpactCount,
        notedImpactCount: gateDecisions.notedImpactCount,
        decisionDigest: gateDecisions.decisionDigest,
        engineVersion: gateDecisions.decisionEngineVersion,
        evaluatedAt: gateDecisions.evaluatedAt,
      })
      .from(gateDecisions)
      .where(
        and(
          eq(gateDecisions.organizationId, organizationId),
          eq(gateDecisions.replayRunId, replayRunId),
        ),
      )
      .limit(1);
    const deltas = await tx
      .select({
        id: replayDeltas.id,
        method: apiOperations.httpMethod,
        path: apiOperations.normalizedPathTemplate,
        kind: replayDeltas.kind,
        stability: replayDeltas.stability,
        agreeingAttempts: replayDeltas.agreeingAttempts,
        totalAttempts: replayDeltas.totalAttempts,
        normalizedBefore: replayDeltas.normalizedBefore,
        normalizedAfter: replayDeltas.normalizedAfter,
        quarantineReason: replayDeltas.quarantineReason,
      })
      .from(replayDeltas)
      .innerJoin(
        apiOperations,
        and(
          eq(apiOperations.organizationId, replayDeltas.organizationId),
          eq(apiOperations.id, replayDeltas.apiOperationId),
        ),
      )
      .where(
        and(
          eq(replayDeltas.organizationId, organizationId),
          eq(replayDeltas.replayRunId, replayRunId),
        ),
      )
      .orderBy(replayDeltas.createdAt);
    const impacts = decision
      ? await tx
          .select({
            id: gateImpacts.id,
            replayDeltaId: gateImpacts.replayDeltaId,
            consumerId: consumers.id,
            consumerAlias: consumers.displayAlias,
            dependencyClaimId: gateImpacts.dependencyClaimId,
            assertionId: gateImpacts.assertionId,
            effectiveTier: gateImpacts.effectiveTier,
            action: gateImpacts.action,
            reasonCode: gateImpacts.reasonCode,
            receiptId: gateImpacts.receiptId,
            gateExceptionId: gateImpacts.gateExceptionId,
          })
          .from(gateImpacts)
          .innerJoin(
            consumers,
            and(
              eq(consumers.organizationId, gateImpacts.organizationId),
              eq(consumers.id, gateImpacts.consumerId),
            ),
          )
          .where(
            and(
              eq(gateImpacts.organizationId, organizationId),
              eq(gateImpacts.gateDecisionId, decision.id),
            ),
          )
          .orderBy(gateImpacts.createdAt)
      : [];
    return {
      run,
      gateDecision: decision ?? null,
      deltas: deltas.map(({ method, path, normalizedBefore, normalizedAfter, ...delta }) => ({
        ...delta,
        operation: { method, path },
        normalizedBefore: asJsonObject(normalizedBefore),
        normalizedAfter: asJsonObject(normalizedAfter),
      })),
      impacts: impacts.map(({ consumerId, consumerAlias, gateExceptionId, ...impact }) => ({
        ...impact,
        consumer: { id: consumerId, alias: consumerAlias },
        exceptionApplied: gateExceptionId !== null,
      })),
    };
  });
}

function policyGateOutcome(value: string): "block" | "warn" | "note" | "pass" {
  if (value !== "block" && value !== "warn" && value !== "note" && value !== "pass") {
    throw new Error("Persisted gate outcome is invalid");
  }
  return value;
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function policyDeltaStability(value: string): "stable" | "flaky" {
  if (value !== "stable" && value !== "flaky") {
    throw new Error("A gate impact referenced an unevaluated replay delta");
  }
  return value;
}

export async function getReplayRunInputs(
  db: Database,
  organizationId: string,
  replayRunId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .select({
        corpusDigest: replayCorpora.corpusDigest,
        fixtureDigest: replayRuns.fixtureDigest,
        maskDigest: replayRuns.maskDigest,
        extractorVersion: extractorReleases.semanticVersion,
      })
      .from(replayRuns)
      .innerJoin(
        replayCorpora,
        and(
          eq(replayCorpora.organizationId, replayRuns.organizationId),
          eq(replayCorpora.id, replayRuns.replayCorpusId),
        ),
      )
      .innerJoin(extractorReleases, eq(extractorReleases.id, replayRuns.extractorReleaseId))
      .where(and(eq(replayRuns.organizationId, organizationId), eq(replayRuns.id, replayRunId)))
      .limit(1);
    return record ?? null;
  });
}

export async function resolveRunnerCredential(
  client: DatabaseClient,
  tokenPrefix: string,
): Promise<RunnerCredentialLookup | null> {
  const rows = await client.sql<
    Array<{
      session_id: string;
      organization_id: string;
      replay_run_id: string;
      token_hash: string;
      scopes: string[];
      nonce_digest: string;
      report_signing_public_key: string;
      signing_key_id: string;
    }>
  >`select * from hyrum_resolve_runner_credential(${tokenPrefix})`;
  const row = rows[0];
  return row
    ? {
        sessionId: row.session_id,
        organizationId: row.organization_id,
        replayRunId: row.replay_run_id,
        tokenHash: row.token_hash,
        scopes: row.scopes,
        nonceDigest: row.nonce_digest,
        reportSigningPublicKey: row.report_signing_public_key,
        signingKeyId: row.signing_key_id,
      }
    : null;
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

export interface ReplayReportObject {
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  contentType: string;
  contentEncoding: string | null;
}

export async function persistReplayReport(
  db: Database,
  credential: RunnerCredentialLookup,
  report: ReplayReport,
  object: ReplayReportObject,
  requestId: string,
): Promise<{
  replayRunId: string;
  deltaCount: number;
  gateDecision: Awaited<ReturnType<typeof evaluateReplayGate>>;
}> {
  return withOrganizationContext(db, credential.organizationId, async (tx) => {
    const now = new Date();
    await tx.execute(
      sql`select id from ci_runner_sessions where organization_id = ${credential.organizationId} and id = ${credential.sessionId} for update`,
    );
    const [session] = await tx
      .select({ consumedAt: ciRunnerSessions.consumedAt, expiresAt: ciRunnerSessions.expiresAt })
      .from(ciRunnerSessions)
      .where(
        and(
          eq(ciRunnerSessions.organizationId, credential.organizationId),
          eq(ciRunnerSessions.id, credential.sessionId),
          isNull(ciRunnerSessions.revokedAt),
        ),
      )
      .limit(1);
    if (!session || session.expiresAt <= now)
      throw new ReplayRunError("invalid", "Runner session expired");
    if (session.consumedAt) throw new ReplayRunError("conflict", "Runner session was consumed");
    const [run] = await tx
      .select({
        id: replayRuns.id,
        status: replayRuns.status,
        corpusDigest: replayCorpora.corpusDigest,
        baseImageDigest: replayRuns.baseImageDigest,
        candidateImageDigest: replayRuns.candidateImageDigest,
        fixtureDigest: replayRuns.fixtureDigest,
        maskDigest: replayRuns.maskDigest,
        runnerVersion: replayRuns.runnerVersion,
        extractorVersion: extractorReleases.semanticVersion,
        minimumStableAttempts: gatePolicyVersions.minimumStableAttempts,
      })
      .from(replayRuns)
      .innerJoin(
        replayCorpora,
        and(
          eq(replayCorpora.organizationId, replayRuns.organizationId),
          eq(replayCorpora.id, replayRuns.replayCorpusId),
        ),
      )
      .innerJoin(extractorReleases, eq(extractorReleases.id, replayRuns.extractorReleaseId))
      .innerJoin(
        gatePolicyVersions,
        and(
          eq(gatePolicyVersions.organizationId, replayRuns.organizationId),
          eq(gatePolicyVersions.id, replayRuns.gatePolicyVersionId),
        ),
      )
      .where(
        and(
          eq(replayRuns.organizationId, credential.organizationId),
          eq(replayRuns.id, credential.replayRunId),
          inArray(replayRuns.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (!run) throw new ReplayRunError("conflict", "Replay run no longer accepts reports");
    const immutableInputsMatch =
      report.replay_run_id === run.id &&
      report.corpus_digest.replace(/^sha256:/, "") === run.corpusDigest.replace(/^sha256:/, "") &&
      report.base_image_digest === run.baseImageDigest &&
      report.candidate_image_digest === run.candidateImageDigest &&
      report.fixture_digest === run.fixtureDigest &&
      report.mask_digest.replace(/^sha256:/, "") === run.maskDigest.replace(/^sha256:/, "") &&
      report.runner_version === run.runnerVersion;
    const nonceMatches =
      report.nonce_digest.replace(/^sha256:/, "") ===
      credential.nonceDigest.replace(/^sha256:/, "");
    if (!immutableInputsMatch || !nonceMatches) {
      throw new ReplayRunError("invalid", "Report immutable inputs do not match the replay run");
    }
    if (report.extractor_version !== run.extractorVersion) {
      throw new ReplayRunError("invalid", "Report extractor version does not match the replay run");
    }
    if (report.attempts < run.minimumStableAttempts) {
      throw new ReplayRunError("invalid", "Report does not meet the policy stability threshold");
    }
    const items = await tx
      .select({
        apiOperationId: corpusItems.apiOperationId,
        behaviorDefinitionId: corpusItems.behaviorDefinitionId,
        consumerId: corpusItems.consumerId,
        assertionId: corpusItems.assertionId,
        requestDigest: corpusItems.requestDigest,
      })
      .from(corpusItems)
      .innerJoin(
        replayRuns,
        and(
          eq(replayRuns.organizationId, corpusItems.organizationId),
          eq(replayRuns.replayCorpusId, corpusItems.replayCorpusId),
          eq(replayRuns.id, credential.replayRunId),
        ),
      )
      .where(eq(corpusItems.organizationId, credential.organizationId));
    const itemKeys = new Set(
      items.map((item) =>
        [
          item.apiOperationId,
          item.behaviorDefinitionId,
          item.consumerId,
          item.assertionId ?? "",
          item.requestDigest,
        ].join(":"),
      ),
    );
    const gateTargets: ReplayDeltaTarget[] = [];
    for (const delta of report.deltas) {
      const key = [
        delta.api_operation_id,
        delta.behavior_definition_id,
        delta.consumer_id,
        delta.assertion_id ?? "",
        delta.request_digest.replace(/^sha256:/, ""),
      ].join(":");
      if (!itemKeys.has(key)) {
        throw new ReplayRunError("invalid", "Report contains a delta outside the immutable corpus");
      }
      const expectedDigest = createHash("sha256")
        .update(
          stableJson({
            api_operation_id: delta.api_operation_id,
            consumer_id: delta.consumer_id,
            kind: delta.kind,
            request_digest: delta.request_digest.replace(/^sha256:/, ""),
            before_digest: delta.before_digest?.replace(/^sha256:/, "") ?? null,
            after_digest: delta.after_digest?.replace(/^sha256:/, "") ?? null,
            normalized_before: delta.normalized_before ?? null,
            normalized_after: delta.normalized_after ?? null,
          }),
        )
        .digest("hex");
      if (delta.delta_digest.replace(/^sha256:/, "") !== expectedDigest) {
        throw new ReplayRunError("invalid", "Report delta digest is invalid");
      }
      const stable =
        delta.total_attempts >= run.minimumStableAttempts &&
        delta.agreeing_attempts === delta.total_attempts;
      if ((stable ? "stable" : "flaky") !== delta.stability) {
        throw new ReplayRunError("invalid", "Report stability label is inconsistent with attempts");
      }
    }
    const [organization] = await tx
      .select({ retentionDays: organizations.retentionDays })
      .from(organizations)
      .where(eq(organizations.id, credential.organizationId))
      .limit(1);
    if (!organization) throw new Error("Organization retention configuration is missing");
    const [stored] = await tx
      .insert(storedObjects)
      .values({
        organizationId: credential.organizationId,
        kind: "replay_report",
        bucket: object.bucket,
        objectKey: object.objectKey,
        contentType: object.contentType,
        contentEncoding: object.contentEncoding,
        byteSize: BigInt(object.byteSize),
        sha256Digest: object.sha256Digest,
        scanStatus: "not_required",
        availabilityStatus: "available",
        expiresAt: new Date(now.getTime() + organization.retentionDays * 86_400_000),
        verifiedAt: now,
        createdByActorType: "ci_runner",
        createdByActorId: credential.sessionId,
      })
      .returning({ id: storedObjects.id });
    if (!stored) throw new Error("Replay report object registration returned no record");
    for (let attempt = 1; attempt <= report.attempts; attempt += 1) {
      await tx
        .insert(replayAttempts)
        .values({
          organizationId: credential.organizationId,
          replayRunId: run.id,
          attemptNumber: attempt,
          status: "succeeded",
          runnerInstanceId: credential.sessionId,
          startedAt: new Date(report.started_at),
          completedAt: new Date(report.completed_at),
          resultDigest: object.sha256Digest,
          reportObjectId: stored.id,
        })
        .onConflictDoUpdate({
          target: [replayAttempts.replayRunId, replayAttempts.attemptNumber],
          set: {
            status: "succeeded",
            runnerInstanceId: credential.sessionId,
            startedAt: new Date(report.started_at),
            completedAt: new Date(report.completed_at),
            resultDigest: object.sha256Digest,
            reportObjectId: stored.id,
          },
        });
    }
    for (const delta of report.deltas) {
      const [createdDelta] = await tx
        .insert(replayDeltas)
        .values({
          organizationId: credential.organizationId,
          replayRunId: run.id,
          apiOperationId: delta.api_operation_id,
          beforeBehaviorDefinitionId: delta.behavior_definition_id,
          kind: delta.kind,
          deltaDigest: delta.delta_digest.replace(/^sha256:/, ""),
          normalizedBefore: delta.normalized_before,
          normalizedAfter: delta.normalized_after,
          maskApplied: {},
          stability: delta.stability,
          agreeingAttempts: delta.agreeing_attempts,
          totalAttempts: delta.total_attempts,
          quarantineReason: delta.stability === "flaky" ? "attempt_disagreement" : null,
        })
        .returning({ id: replayDeltas.id });
      if (!createdDelta) throw new Error("Replay delta creation returned no record");
      gateTargets.push({
        replayDeltaId: createdDelta.id,
        consumerId: delta.consumer_id,
        behaviorDefinitionId: delta.behavior_definition_id,
        assertionId: delta.assertion_id,
        stability: delta.stability,
      });
      const claims = await tx
        .select({ id: dependencyClaims.id })
        .from(dependencyClaims)
        .where(
          and(
            eq(dependencyClaims.organizationId, credential.organizationId),
            eq(dependencyClaims.behaviorDefinitionId, delta.behavior_definition_id),
            eq(dependencyClaims.consumerId, delta.consumer_id),
            eq(dependencyClaims.status, "active"),
          ),
        );
      if (claims.length) {
        await tx.insert(deltaClaimMatches).values(
          claims.map(({ id }) => ({
            organizationId: credential.organizationId,
            replayDeltaId: createdDelta.id,
            dependencyClaimId: id,
            matchRuleVersion: "exact-corpus-v1",
            matchDigest: createHash("sha256").update(`${createdDelta.id}:${id}`).digest("hex"),
            matched: true,
          })),
        );
      }
      if (delta.assertion_id) {
        const [assertion] = await tx
          .select({ id: assertions.id })
          .from(assertions)
          .where(
            and(
              eq(assertions.organizationId, credential.organizationId),
              eq(assertions.id, delta.assertion_id),
              inArray(assertions.status, ["active", "expiring"]),
              gt(assertions.expiresAt, now),
            ),
          )
          .limit(1);
        if (assertion) {
          await tx.insert(deltaAssertionMatches).values({
            organizationId: credential.organizationId,
            replayDeltaId: createdDelta.id,
            assertionId: assertion.id,
            matchRuleVersion: "exact-corpus-v1",
            matchDigest: createHash("sha256")
              .update(`${createdDelta.id}:${assertion.id}`)
              .digest("hex"),
            matched: true,
          });
        }
      }
    }
    await tx
      .update(ciRunnerSessions)
      .set({ consumedAt: now })
      .where(
        and(
          eq(ciRunnerSessions.organizationId, credential.organizationId),
          eq(ciRunnerSessions.id, credential.sessionId),
          isNull(ciRunnerSessions.consumedAt),
        ),
      );
    await tx
      .update(replayRuns)
      .set({
        status: "succeeded",
        startedAt: new Date(report.started_at),
        completedAt: new Date(report.completed_at),
        reportObjectId: stored.id,
        reportDigest: object.sha256Digest,
        signatureKeyId: credential.signingKeyId,
        signatureVerifiedAt: now,
        updatedAt: now,
      })
      .where(eq(replayRuns.id, run.id));
    const gateDecision = await evaluateReplayGate(
      tx,
      credential.organizationId,
      run.id,
      gateTargets,
      now,
      requestId,
    );
    const event = {
      replayRunId: run.id,
      deltaCount: report.deltas.length,
      gateDecisionId: gateDecision.id,
      gateOutcome: gateDecision.outcome,
    };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId: credential.organizationId,
        occurredAt: now,
        actorType: "ci_runner",
        actorId: credential.sessionId,
        action: "replay_report.accepted",
        resourceType: "replay_run",
        resourceId: run.id,
        requestId,
        changes: event,
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId: credential.organizationId,
        topic: "replay.completed",
        aggregateType: "replay_run",
        aggregateId: run.id,
        eventVersion: 1,
        payload: event,
        payloadDigest: createHash("sha256").update(JSON.stringify(event)).digest("hex"),
      }),
    ]);
    return { replayRunId: run.id, deltaCount: report.deltas.length, gateDecision };
  });
}
