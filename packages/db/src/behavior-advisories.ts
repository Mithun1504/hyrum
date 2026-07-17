import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  auditEvents,
  behaviorClusterMembers,
  behaviorClusters,
  behaviorDefinitions,
  behaviorLabels,
  claimEvidence,
  consumers,
  dependencyClaims,
  jobs,
  llmCitations,
  llmRuns,
  promptVersions,
  receipts,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";
import { withOrganizationContext } from "./tenancy";

export const BEHAVIOR_LABEL_TASK = "behavior_label_proposal";
export const TIER_PROPOSAL_TASK = "tier_proposal";

export interface BehaviorLabelPromptData {
  behaviorDefinitionId: string;
  defaultLabel: string;
  kind: "shape" | "ordering" | "error_template";
  canonicalFingerprint: unknown;
  operation: { method: string; pathTemplate: string };
}

export interface BehaviorLabelOutput {
  label: string;
  description: string;
  clusterLabel: string | null;
  uncertainty: number;
  abstained: boolean;
  abstentionReason: string | null;
  citations: Array<{
    resourceType: "receipt" | "dependency_claim" | "replay_delta" | "behavior_definition";
    resourceId: string;
    role: "supports" | "context" | "counterexample";
  }>;
}

export interface TierProposalPromptData {
  dependencyClaimId: string;
  currentTier: "t1" | "t2" | "t3";
  deterministicEligible: boolean;
  supportCount: string;
  consumerAlias: string;
  behavior: {
    id: string;
    kind: "shape" | "ordering" | "error_template";
    canonicalFingerprint: unknown;
  };
  evidence: Array<{
    receiptId: string;
    receiptType: "t1_echo" | "t2_pattern" | "exposure" | "replay_delta" | "assertion";
    patternMetrics: unknown;
  }>;
  citationResources: {
    behaviorDefinitionIds: string[];
    dependencyClaimIds: string[];
    receiptIds: string[];
  };
}

export interface TierProposalOutput {
  proposedTier: "t2" | "t3";
  rationale: string;
  uncertainty: number;
  abstained: boolean;
  abstentionReason: string | null;
  citations: BehaviorLabelOutput["citations"];
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

const digest = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");

async function loadBehaviorLabelInput(
  tx: DatabaseTransaction,
  organizationId: string,
  behaviorDefinitionId: string,
): Promise<{ apiServiceId: string; input: BehaviorLabelPromptData } | null> {
  const [row] = await tx
    .select({
      apiServiceId: behaviorDefinitions.apiServiceId,
      id: behaviorDefinitions.id,
      defaultLabel: behaviorDefinitions.defaultLabel,
      kind: behaviorDefinitions.kind,
      canonicalFingerprint: behaviorDefinitions.canonicalFingerprint,
      method: apiOperations.httpMethod,
      pathTemplate: apiOperations.normalizedPathTemplate,
    })
    .from(behaviorDefinitions)
    .innerJoin(
      apiOperations,
      and(
        eq(apiOperations.organizationId, behaviorDefinitions.organizationId),
        eq(apiOperations.id, behaviorDefinitions.apiOperationId),
      ),
    )
    .where(
      and(
        eq(behaviorDefinitions.organizationId, organizationId),
        eq(behaviorDefinitions.id, behaviorDefinitionId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    apiServiceId: row.apiServiceId,
    input: {
      behaviorDefinitionId: row.id,
      defaultLabel: row.defaultLabel,
      kind: row.kind,
      canonicalFingerprint: row.canonicalFingerprint,
      operation: { method: row.method, pathTemplate: row.pathTemplate },
    },
  };
}

export async function requestBehaviorLabelProposal(
  db: Database,
  organizationId: string,
  behaviorDefinitionId: string,
  actor: { userId: string; requestId: string },
  prompt: {
    version: number;
    model: string;
    promptDigest: string;
    schemaDigest: string;
    sourceRevision: string;
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const loaded = await loadBehaviorLabelInput(tx, organizationId, behaviorDefinitionId);
    if (!loaded) return null;
    await tx
      .insert(promptVersions)
      .values({
        taskType: BEHAVIOR_LABEL_TASK,
        version: prompt.version,
        modelFamily: "gpt-5.6",
        promptDigest: prompt.promptDigest,
        schemaDigest: prompt.schemaDigest,
        sourceRevision: prompt.sourceRevision,
        status: "evaluated",
      })
      .onConflictDoNothing({ target: [promptVersions.taskType, promptVersions.version] });
    const [promptVersion] = await tx
      .select({ id: promptVersions.id })
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.taskType, BEHAVIOR_LABEL_TASK),
          eq(promptVersions.version, prompt.version),
          eq(promptVersions.promptDigest, prompt.promptDigest),
          eq(promptVersions.schemaDigest, prompt.schemaDigest),
        ),
      )
      .limit(1);
    if (!promptVersion)
      throw new Error("The configured prompt version conflicts with the database");
    const inputDigest = digest(loaded.input);
    const cacheKey = digest({ inputDigest, model: prompt.model, schema: prompt.schemaDigest });
    const [existing] = await tx
      .select({ id: llmRuns.id, status: llmRuns.status })
      .from(llmRuns)
      .where(
        and(
          eq(llmRuns.organizationId, organizationId),
          eq(llmRuns.taskType, BEHAVIOR_LABEL_TASK),
          eq(llmRuns.promptVersionId, promptVersion.id),
          eq(llmRuns.cacheKey, cacheKey),
          inArray(llmRuns.status, ["queued", "running", "succeeded"]),
        ),
      )
      .orderBy(desc(llmRuns.createdAt))
      .limit(1);
    if (existing) return existing;
    const [run] = await tx
      .insert(llmRuns)
      .values({
        organizationId,
        apiServiceId: loaded.apiServiceId,
        taskType: BEHAVIOR_LABEL_TASK,
        promptVersionId: promptVersion.id,
        model: prompt.model,
        modelSnapshot: prompt.model,
        reasoningEffort: "low",
        inputDigest,
        cacheKey,
      })
      .returning({ id: llmRuns.id, status: llmRuns.status });
    if (!run) throw new Error("Failed to create behavior label run");
    await Promise.all([
      tx.insert(jobs).values({
        organizationId,
        type: "generate_behavior_label",
        payload: { llmRunId: run.id, behaviorDefinitionId },
        idempotencyKey: `behavior-label:${run.id}`,
        concurrencyKey: `openai:${organizationId}`,
        maxAttempts: 3,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: new Date(),
        actorType: "user",
        actorId: actor.userId,
        action: "advisory.behavior_label_requested",
        resourceType: "llm_run",
        resourceId: run.id,
        requestId: actor.requestId,
        changes: { behaviorDefinitionId, inputDigest, promptVersion: prompt.version },
        outcome: "succeeded",
      }),
    ]);
    return run;
  });
}

export async function prepareBehaviorLabelProposal(
  tx: DatabaseTransaction,
  organizationId: string,
  llmRunId: string,
  behaviorDefinitionId: string,
) {
  const [run] = await tx
    .select({
      id: llmRuns.id,
      status: llmRuns.status,
      model: llmRuns.model,
      inputDigest: llmRuns.inputDigest,
    })
    .from(llmRuns)
    .where(
      and(
        eq(llmRuns.organizationId, organizationId),
        eq(llmRuns.id, llmRunId),
        eq(llmRuns.taskType, BEHAVIOR_LABEL_TASK),
      ),
    )
    .limit(1);
  if (!run || run.status === "succeeded" || run.status === "rejected") return null;
  const loaded = await loadBehaviorLabelInput(tx, organizationId, behaviorDefinitionId);
  if (!loaded || digest(loaded.input) !== run.inputDigest)
    throw new Error("Behavior label input no longer matches its immutable digest");
  await tx
    .update(llmRuns)
    .set({ status: "running", startedAt: new Date(), failureCode: null })
    .where(and(eq(llmRuns.organizationId, organizationId), eq(llmRuns.id, llmRunId)));
  return { ...run, apiServiceId: loaded.apiServiceId, input: loaded.input };
}

export async function completeBehaviorLabelProposal(
  tx: DatabaseTransaction,
  organizationId: string,
  prepared: { id: string; apiServiceId: string; input: BehaviorLabelPromptData },
  result: {
    output: BehaviorLabelOutput;
    responseId: string | null;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    outputDigest: string;
    fallbackCode?: string;
  },
) {
  const completedAt = new Date();
  await tx
    .update(llmRuns)
    .set({
      status: result.fallbackCode ? "failed" : "succeeded",
      modelSnapshot: result.model,
      openaiResponseId: result.responseId,
      schemaValid: result.fallbackCode ? null : true,
      deterministicValidationStatus: result.fallbackCode ? "not_applicable" : "passed",
      outputDigest: result.outputDigest,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      completedAt,
      failureCode: result.fallbackCode ?? null,
      abstentionReason: result.output.abstentionReason,
    })
    .where(and(eq(llmRuns.organizationId, organizationId), eq(llmRuns.id, prepared.id)));
  const [label] = await tx
    .insert(behaviorLabels)
    .values({
      organizationId,
      behaviorDefinitionId: prepared.input.behaviorDefinitionId,
      label: result.output.label,
      description: result.output.description,
      source: "model",
      llmRunId: prepared.id,
    })
    .returning({ id: behaviorLabels.id });
  if (!label) throw new Error("Failed to persist behavior label proposal");
  if (result.output.clusterLabel) {
    const [cluster] = await tx
      .insert(behaviorClusters)
      .values({
        organizationId,
        apiServiceId: prepared.apiServiceId,
        label: result.output.clusterLabel,
        description: result.output.description,
        source: "model",
        llmRunId: prepared.id,
        inputDigest: digest(prepared.input),
      })
      .returning({ id: behaviorClusters.id });
    if (cluster) {
      await tx.insert(behaviorClusterMembers).values({
        organizationId,
        behaviorClusterId: cluster.id,
        behaviorDefinitionId: prepared.input.behaviorDefinitionId,
        membershipSource: "model",
        score: String(Math.max(0, Math.min(1, 1 - result.output.uncertainty))),
      });
    }
  }
  if (result.output.citations.length) {
    await tx.insert(llmCitations).values(
      result.output.citations.map((citation) => ({
        organizationId,
        llmRunId: prepared.id,
        behaviorDefinitionId: citation.resourceId,
        citationRole: citation.role,
        validated: true,
      })),
    );
  }
}

export async function getBehaviorLabelProposal(
  db: Database,
  organizationId: string,
  behaviorDefinitionId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({
        id: behaviorLabels.id,
        label: behaviorLabels.label,
        description: behaviorLabels.description,
        status: behaviorLabels.status,
        llmRunId: behaviorLabels.llmRunId,
        modelStatus: llmRuns.status,
        model: llmRuns.modelSnapshot,
        abstentionReason: llmRuns.abstentionReason,
        createdAt: behaviorLabels.createdAt,
      })
      .from(behaviorLabels)
      .innerJoin(
        llmRuns,
        and(
          eq(llmRuns.organizationId, behaviorLabels.organizationId),
          eq(llmRuns.id, behaviorLabels.llmRunId),
        ),
      )
      .where(
        and(
          eq(behaviorLabels.organizationId, organizationId),
          eq(behaviorLabels.behaviorDefinitionId, behaviorDefinitionId),
          eq(behaviorLabels.source, "model"),
        ),
      )
      .orderBy(desc(behaviorLabels.createdAt))
      .limit(1);
    return row ?? null;
  });
}

export async function reviewBehaviorLabelProposal(
  db: Database,
  organizationId: string,
  labelId: string,
  actor: { membershipId: string; userId: string; requestId: string },
  decision: "accept" | "reject",
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [proposal] = await tx
      .select({
        id: behaviorLabels.id,
        behaviorDefinitionId: behaviorLabels.behaviorDefinitionId,
        runStatus: llmRuns.status,
        abstentionReason: llmRuns.abstentionReason,
      })
      .from(behaviorLabels)
      .innerJoin(
        llmRuns,
        and(
          eq(llmRuns.organizationId, behaviorLabels.organizationId),
          eq(llmRuns.id, behaviorLabels.llmRunId),
        ),
      )
      .where(
        and(
          eq(behaviorLabels.organizationId, organizationId),
          eq(behaviorLabels.id, labelId),
          eq(behaviorLabels.status, "proposed"),
        ),
      )
      .limit(1);
    if (!proposal) return null;
    if (decision === "accept" && (proposal.runStatus !== "succeeded" || proposal.abstentionReason))
      throw new Error("An abstained or failed label cannot be activated");
    if (decision === "accept") {
      await tx
        .update(behaviorLabels)
        .set({ status: "superseded", reviewedByMembershipId: actor.membershipId })
        .where(
          and(
            eq(behaviorLabels.organizationId, organizationId),
            eq(behaviorLabels.behaviorDefinitionId, proposal.behaviorDefinitionId),
            eq(behaviorLabels.status, "active"),
          ),
        );
    }
    await tx
      .update(behaviorLabels)
      .set({
        status: decision === "accept" ? "active" : "rejected",
        reviewedByMembershipId: actor.membershipId,
      })
      .where(
        and(eq(behaviorLabels.organizationId, organizationId), eq(behaviorLabels.id, labelId)),
      );
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: `behavior_label.${decision}ed`,
      resourceType: "behavior_label",
      resourceId: labelId,
      requestId: actor.requestId,
      changes: { decision },
      outcome: "succeeded",
    });
    return { id: labelId };
  });
}

async function loadTierProposalInput(
  tx: DatabaseTransaction,
  organizationId: string,
  dependencyClaimId: string,
): Promise<{
  apiServiceId: string;
  claim: typeof dependencyClaims.$inferSelect;
  input: TierProposalPromptData;
} | null> {
  const [row] = await tx
    .select({
      claim: dependencyClaims,
      consumerAlias: consumers.displayAlias,
      behaviorId: behaviorDefinitions.id,
      behaviorKind: behaviorDefinitions.kind,
      canonicalFingerprint: behaviorDefinitions.canonicalFingerprint,
    })
    .from(dependencyClaims)
    .innerJoin(
      consumers,
      and(
        eq(consumers.organizationId, dependencyClaims.organizationId),
        eq(consumers.id, dependencyClaims.consumerId),
      ),
    )
    .innerJoin(
      behaviorDefinitions,
      and(
        eq(behaviorDefinitions.organizationId, dependencyClaims.organizationId),
        eq(behaviorDefinitions.id, dependencyClaims.behaviorDefinitionId),
      ),
    )
    .where(
      and(
        eq(dependencyClaims.organizationId, organizationId),
        eq(dependencyClaims.id, dependencyClaimId),
        eq(dependencyClaims.status, "active"),
      ),
    )
    .limit(1);
  if (!row) return null;
  const evidence = await tx
    .select({
      receiptId: receipts.id,
      receiptType: receipts.receiptType,
      patternMetrics: claimEvidence.patternMetrics,
    })
    .from(claimEvidence)
    .innerJoin(
      receipts,
      and(
        eq(receipts.organizationId, claimEvidence.organizationId),
        eq(receipts.id, claimEvidence.receiptId),
      ),
    )
    .where(
      and(
        eq(claimEvidence.organizationId, organizationId),
        eq(claimEvidence.dependencyClaimId, dependencyClaimId),
        eq(receipts.availabilityStatus, "available"),
      ),
    )
    .limit(100);
  return {
    apiServiceId: row.claim.apiServiceId,
    claim: row.claim,
    input: {
      dependencyClaimId,
      currentTier: row.claim.tier,
      deterministicEligible: row.claim.deterministicEligible,
      supportCount: row.claim.supportCount.toString(),
      consumerAlias: row.consumerAlias,
      behavior: {
        id: row.behaviorId,
        kind: row.behaviorKind,
        canonicalFingerprint: row.canonicalFingerprint,
      },
      evidence,
      citationResources: {
        behaviorDefinitionIds: [row.behaviorId],
        dependencyClaimIds: [dependencyClaimId],
        receiptIds: evidence.map(({ receiptId }) => receiptId),
      },
    },
  };
}

export async function requestTierProposal(
  db: Database,
  organizationId: string,
  dependencyClaimId: string,
  actor: { userId: string; requestId: string },
  prompt: {
    version: number;
    model: string;
    promptDigest: string;
    schemaDigest: string;
    sourceRevision: string;
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const loaded = await loadTierProposalInput(tx, organizationId, dependencyClaimId);
    if (!loaded) return null;
    await tx
      .insert(promptVersions)
      .values({
        taskType: TIER_PROPOSAL_TASK,
        version: prompt.version,
        modelFamily: "gpt-5.6",
        promptDigest: prompt.promptDigest,
        schemaDigest: prompt.schemaDigest,
        sourceRevision: prompt.sourceRevision,
        status: "evaluated",
      })
      .onConflictDoNothing({ target: [promptVersions.taskType, promptVersions.version] });
    const [promptVersion] = await tx
      .select({ id: promptVersions.id })
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.taskType, TIER_PROPOSAL_TASK),
          eq(promptVersions.version, prompt.version),
          eq(promptVersions.promptDigest, prompt.promptDigest),
          eq(promptVersions.schemaDigest, prompt.schemaDigest),
        ),
      )
      .limit(1);
    if (!promptVersion)
      throw new Error("The configured prompt version conflicts with the database");
    const inputDigest = digest(loaded.input);
    const cacheKey = digest({ inputDigest, model: prompt.model, schema: prompt.schemaDigest });
    const [existing] = await tx
      .select({ id: llmRuns.id, status: llmRuns.status })
      .from(llmRuns)
      .where(
        and(
          eq(llmRuns.organizationId, organizationId),
          eq(llmRuns.taskType, TIER_PROPOSAL_TASK),
          eq(llmRuns.promptVersionId, promptVersion.id),
          eq(llmRuns.cacheKey, cacheKey),
          inArray(llmRuns.status, ["queued", "running", "succeeded"]),
        ),
      )
      .orderBy(desc(llmRuns.createdAt))
      .limit(1);
    if (existing) return existing;
    const [run] = await tx
      .insert(llmRuns)
      .values({
        organizationId,
        apiServiceId: loaded.apiServiceId,
        taskType: TIER_PROPOSAL_TASK,
        promptVersionId: promptVersion.id,
        model: prompt.model,
        modelSnapshot: prompt.model,
        reasoningEffort: "low",
        inputDigest,
        cacheKey,
      })
      .returning({ id: llmRuns.id, status: llmRuns.status });
    if (!run) throw new Error("Failed to create tier proposal run");
    await Promise.all([
      tx.insert(jobs).values({
        organizationId,
        type: "generate_tier_proposal",
        payload: { llmRunId: run.id, dependencyClaimId },
        idempotencyKey: `tier-proposal:${run.id}`,
        concurrencyKey: `openai:${organizationId}`,
        maxAttempts: 3,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: new Date(),
        actorType: "user",
        actorId: actor.userId,
        action: "advisory.tier_proposal_requested",
        resourceType: "llm_run",
        resourceId: run.id,
        requestId: actor.requestId,
        changes: { dependencyClaimId, inputDigest, promptVersion: prompt.version },
        outcome: "succeeded",
      }),
    ]);
    return run;
  });
}

export async function prepareTierProposal(
  tx: DatabaseTransaction,
  organizationId: string,
  llmRunId: string,
  dependencyClaimId: string,
) {
  const [run] = await tx
    .select({
      id: llmRuns.id,
      status: llmRuns.status,
      model: llmRuns.model,
      inputDigest: llmRuns.inputDigest,
    })
    .from(llmRuns)
    .where(
      and(
        eq(llmRuns.organizationId, organizationId),
        eq(llmRuns.id, llmRunId),
        eq(llmRuns.taskType, TIER_PROPOSAL_TASK),
      ),
    )
    .limit(1);
  if (!run || run.status === "succeeded" || run.status === "rejected") return null;
  const loaded = await loadTierProposalInput(tx, organizationId, dependencyClaimId);
  if (!loaded || digest(loaded.input) !== run.inputDigest)
    throw new Error("Tier proposal input no longer matches its immutable digest");
  await tx
    .update(llmRuns)
    .set({ status: "running", startedAt: new Date(), failureCode: null })
    .where(and(eq(llmRuns.organizationId, organizationId), eq(llmRuns.id, llmRunId)));
  return { ...run, input: loaded.input, claim: loaded.claim };
}

export async function completeTierProposal(
  tx: DatabaseTransaction,
  organizationId: string,
  prepared: {
    id: string;
    input: TierProposalPromptData;
    claim: typeof dependencyClaims.$inferSelect;
  },
  result: {
    output: TierProposalOutput;
    responseId: string | null;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    outputDigest: string;
    fallbackCode?: string;
  },
) {
  const completedAt = new Date();
  await tx
    .update(llmRuns)
    .set({
      status: result.fallbackCode ? "failed" : "succeeded",
      modelSnapshot: result.model,
      openaiResponseId: result.responseId,
      schemaValid: result.fallbackCode ? null : true,
      deterministicValidationStatus: result.fallbackCode ? "not_applicable" : "passed",
      outputDigest: result.outputDigest,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      completedAt,
      failureCode: result.fallbackCode ?? null,
      abstentionReason: result.output.abstentionReason,
    })
    .where(and(eq(llmRuns.organizationId, organizationId), eq(llmRuns.id, prepared.id)));
  await tx.insert(dependencyClaims).values({
    organizationId,
    apiServiceId: prepared.claim.apiServiceId,
    environmentId: prepared.claim.environmentId,
    consumerId: prepared.claim.consumerId,
    behaviorDefinitionId: prepared.claim.behaviorDefinitionId,
    tier: result.output.proposedTier,
    status: "proposed",
    ruleVersion: `model-proposal:${prepared.id}`,
    deterministicEligible: false,
    supportCount: prepared.claim.supportCount,
    confidence:
      result.output.proposedTier === "t2"
        ? String(Math.max(0, Math.min(1, 1 - result.output.uncertainty)))
        : null,
    effectiveFrom: completedAt,
    supersedesClaimId: prepared.claim.id,
    proposedBy: "model",
    llmRunId: prepared.id,
  });
  if (result.output.citations.length) {
    await tx.insert(llmCitations).values(
      result.output.citations.map((citation) => ({
        organizationId,
        llmRunId: prepared.id,
        ...(citation.resourceType === "receipt" ? { receiptId: citation.resourceId } : {}),
        ...(citation.resourceType === "dependency_claim"
          ? { dependencyClaimId: citation.resourceId }
          : {}),
        ...(citation.resourceType === "behavior_definition"
          ? { behaviorDefinitionId: citation.resourceId }
          : {}),
        citationRole: citation.role,
        validated: true,
      })),
    );
  }
}

export async function getTierProposal(
  db: Database,
  organizationId: string,
  dependencyClaimId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({
        id: dependencyClaims.id,
        proposedTier: dependencyClaims.tier,
        confidence: dependencyClaims.confidence,
        status: dependencyClaims.status,
        llmRunId: dependencyClaims.llmRunId,
        modelStatus: llmRuns.status,
        model: llmRuns.modelSnapshot,
        abstentionReason: llmRuns.abstentionReason,
        createdAt: dependencyClaims.createdAt,
      })
      .from(dependencyClaims)
      .innerJoin(
        llmRuns,
        and(
          eq(llmRuns.organizationId, dependencyClaims.organizationId),
          eq(llmRuns.id, dependencyClaims.llmRunId),
        ),
      )
      .where(
        and(
          eq(dependencyClaims.organizationId, organizationId),
          eq(dependencyClaims.supersedesClaimId, dependencyClaimId),
          eq(dependencyClaims.proposedBy, "model"),
        ),
      )
      .orderBy(desc(dependencyClaims.createdAt))
      .limit(1);
    return row ?? null;
  });
}

export async function getAdvisoryBatch(
  db: Database,
  organizationId: string,
  input: { behaviorIds: readonly string[]; claimIds: readonly string[] },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const labels = input.behaviorIds.length
      ? await tx
          .selectDistinctOn([behaviorLabels.behaviorDefinitionId], {
            behaviorDefinitionId: behaviorLabels.behaviorDefinitionId,
            id: behaviorLabels.id,
            label: behaviorLabels.label,
            description: behaviorLabels.description,
            status: behaviorLabels.status,
            llmRunId: behaviorLabels.llmRunId,
            modelStatus: llmRuns.status,
            model: llmRuns.modelSnapshot,
            abstentionReason: llmRuns.abstentionReason,
            createdAt: behaviorLabels.createdAt,
          })
          .from(behaviorLabels)
          .innerJoin(
            llmRuns,
            and(
              eq(llmRuns.organizationId, behaviorLabels.organizationId),
              eq(llmRuns.id, behaviorLabels.llmRunId),
            ),
          )
          .where(
            and(
              eq(behaviorLabels.organizationId, organizationId),
              inArray(behaviorLabels.behaviorDefinitionId, [...new Set(input.behaviorIds)]),
              eq(behaviorLabels.source, "model"),
            ),
          )
          .orderBy(behaviorLabels.behaviorDefinitionId, desc(behaviorLabels.createdAt))
      : [];
    const tiers = input.claimIds.length
      ? await tx
          .selectDistinctOn([dependencyClaims.supersedesClaimId], {
            dependencyClaimId: dependencyClaims.supersedesClaimId,
            id: dependencyClaims.id,
            proposedTier: dependencyClaims.tier,
            confidence: dependencyClaims.confidence,
            status: dependencyClaims.status,
            llmRunId: dependencyClaims.llmRunId,
            modelStatus: llmRuns.status,
            model: llmRuns.modelSnapshot,
            abstentionReason: llmRuns.abstentionReason,
            createdAt: dependencyClaims.createdAt,
          })
          .from(dependencyClaims)
          .innerJoin(
            llmRuns,
            and(
              eq(llmRuns.organizationId, dependencyClaims.organizationId),
              eq(llmRuns.id, dependencyClaims.llmRunId),
            ),
          )
          .where(
            and(
              eq(dependencyClaims.organizationId, organizationId),
              inArray(dependencyClaims.supersedesClaimId, [...new Set(input.claimIds)]),
              eq(dependencyClaims.proposedBy, "model"),
            ),
          )
          .orderBy(dependencyClaims.supersedesClaimId, desc(dependencyClaims.createdAt))
      : [];
    return { labels, tiers };
  });
}
