import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  auditEvents,
  consumers,
  gateDecisions,
  gateImpacts,
  generatedDrafts,
  jobs,
  llmCitations,
  llmRuns,
  promptVersions,
  replayDeltas,
  replayRuns,
  usageRollups,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";
import { withOrganizationContext } from "./tenancy";

export const REPLAY_IMPACT_TASK = "replay_impact_explanation";

export interface ReplayImpactPromptData {
  replayRunId: string;
  deterministicDecision: {
    id: string;
    outcome: "block" | "warn" | "note" | "pass";
    decisionDigest: string;
  };
  deltas: Array<{
    id: string;
    method: string;
    pathTemplate: string;
    kind: "shape" | "ordering" | "error_template";
    stability: "stable" | "flaky";
  }>;
  impacts: Array<{
    replayDeltaId: string;
    consumerAlias: string;
    action: "block" | "warn" | "note" | "pass";
    reasonCode: string;
    effectiveTier: "t1" | "t2" | "t3" | null;
    receiptId: string | null;
    dependencyClaimId: string | null;
    assertionId: string | null;
  }>;
}

export interface ReplayImpactOutput {
  headline: string;
  summary: string;
  affectedConsumers: string[];
  recommendedActions: string[];
  uncertainty: number;
  abstained: boolean;
  abstentionReason: string | null;
  citations: Array<{
    resourceType: "receipt" | "dependency_claim" | "replay_delta" | "behavior_definition";
    resourceId: string;
    role: "supports" | "context" | "counterexample";
  }>;
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

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function finalGateOutcome(value: string): "block" | "warn" | "note" | "pass" {
  if (value === "block" || value === "warn" || value === "note" || value === "pass") return value;
  throw new Error("Replay does not have a final deterministic gate outcome");
}

function finalStability(value: string): "stable" | "flaky" {
  if (value === "stable" || value === "flaky") return value;
  throw new Error("Replay contains an unevaluated delta");
}

function citationRole(value: string): "supports" | "context" | "counterexample" {
  if (value === "supports" || value === "context" || value === "counterexample") return value;
  throw new Error("Persisted advisory citation has an invalid role");
}

async function loadPromptData(
  tx: DatabaseTransaction,
  organizationId: string,
  replayRunId: string,
): Promise<{ apiServiceId: string; data: ReplayImpactPromptData } | null> {
  const [decision] = await tx
    .select({
      apiServiceId: replayRuns.apiServiceId,
      status: replayRuns.status,
      id: gateDecisions.id,
      outcome: gateDecisions.outcome,
      decisionDigest: gateDecisions.decisionDigest,
    })
    .from(replayRuns)
    .innerJoin(
      gateDecisions,
      and(
        eq(gateDecisions.organizationId, replayRuns.organizationId),
        eq(gateDecisions.replayRunId, replayRuns.id),
      ),
    )
    .where(and(eq(replayRuns.organizationId, organizationId), eq(replayRuns.id, replayRunId)))
    .limit(1);
  if (!decision) return null;
  if (decision.status !== "succeeded") throw new Error("Only a completed replay can be explained");
  const deltas = await tx
    .select({
      id: replayDeltas.id,
      method: apiOperations.httpMethod,
      pathTemplate: apiOperations.normalizedPathTemplate,
      kind: replayDeltas.kind,
      stability: replayDeltas.stability,
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
  if (deltas.length === 0)
    throw new Error("A replay with no deltas does not need an AI explanation");
  const impacts = await tx
    .select({
      replayDeltaId: gateImpacts.replayDeltaId,
      consumerAlias: consumers.displayAlias,
      action: gateImpacts.action,
      reasonCode: gateImpacts.reasonCode,
      effectiveTier: gateImpacts.effectiveTier,
      receiptId: gateImpacts.receiptId,
      dependencyClaimId: gateImpacts.dependencyClaimId,
      assertionId: gateImpacts.assertionId,
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
    .orderBy(gateImpacts.createdAt);
  return {
    apiServiceId: decision.apiServiceId,
    data: {
      replayRunId,
      deterministicDecision: {
        id: decision.id,
        outcome: finalGateOutcome(decision.outcome),
        decisionDigest: decision.decisionDigest,
      },
      deltas: deltas.map(({ stability, ...delta }) => ({
        ...delta,
        stability: finalStability(stability),
      })),
      impacts: impacts.map(({ action, ...impact }) => ({
        ...impact,
        action: finalGateOutcome(action),
      })),
    },
  };
}

export async function requestReplayImpactExplanation(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  replayRunId: string,
  actor: { userId: string; requestId: string },
  prompt: {
    version: number;
    model: string;
    modelFamily: string;
    promptDigest: string;
    schemaDigest: string;
    sourceRevision: string;
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const loaded = await loadPromptData(tx, organizationId, replayRunId);
    if (!loaded || loaded.apiServiceId !== apiServiceId) return null;
    await tx
      .insert(promptVersions)
      .values({
        taskType: REPLAY_IMPACT_TASK,
        version: prompt.version,
        modelFamily: prompt.modelFamily,
        promptDigest: prompt.promptDigest,
        schemaDigest: prompt.schemaDigest,
        sourceRevision: prompt.sourceRevision,
        status: "evaluated",
      })
      .onConflictDoNothing({
        target: [promptVersions.taskType, promptVersions.version],
      });
    const [promptVersion] = await tx
      .select({ id: promptVersions.id })
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.taskType, REPLAY_IMPACT_TASK),
          eq(promptVersions.version, prompt.version),
          eq(promptVersions.promptDigest, prompt.promptDigest),
          eq(promptVersions.schemaDigest, prompt.schemaDigest),
        ),
      )
      .limit(1);
    if (!promptVersion)
      throw new Error("The configured prompt version conflicts with the database");
    const inputDigest = digest(loaded.data);
    const cacheKey = digest({ inputDigest, model: prompt.model, schema: prompt.schemaDigest });
    const [existing] = await tx
      .select({ id: llmRuns.id, status: llmRuns.status })
      .from(llmRuns)
      .where(
        and(
          eq(llmRuns.organizationId, organizationId),
          eq(llmRuns.taskType, REPLAY_IMPACT_TASK),
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
        apiServiceId,
        taskType: REPLAY_IMPACT_TASK,
        promptVersionId: promptVersion.id,
        model: prompt.model,
        modelSnapshot: prompt.model,
        reasoningEffort: "medium",
        inputDigest,
        cacheKey,
      })
      .returning({ id: llmRuns.id, status: llmRuns.status });
    if (!run) throw new Error("Failed to create advisory model run");
    await Promise.all([
      tx.insert(jobs).values({
        organizationId,
        type: "generate_replay_impact_explanation",
        payload: { llmRunId: run.id, replayRunId },
        idempotencyKey: `replay-impact:${run.id}`,
        concurrencyKey: `openai:${organizationId}`,
        maxAttempts: 3,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: new Date(),
        actorType: "user",
        actorId: actor.userId,
        action: "advisory.replay_impact_requested",
        resourceType: "llm_run",
        resourceId: run.id,
        requestId: actor.requestId,
        changes: { replayRunId, inputDigest, promptVersion: prompt.version },
        outcome: "succeeded",
      }),
    ]);
    return run;
  });
}

export async function prepareReplayImpactExplanation(
  tx: DatabaseTransaction,
  organizationId: string,
  llmRunId: string,
  replayRunId: string,
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
        eq(llmRuns.taskType, REPLAY_IMPACT_TASK),
      ),
    )
    .limit(1);
  if (!run || run.status === "succeeded" || run.status === "rejected") return null;
  const loaded = await loadPromptData(tx, organizationId, replayRunId);
  if (!loaded || digest(loaded.data) !== run.inputDigest) {
    throw new Error("Persisted advisory input no longer matches its immutable digest");
  }
  await tx
    .update(llmRuns)
    .set({ status: "running", startedAt: new Date(), failureCode: null })
    .where(and(eq(llmRuns.organizationId, organizationId), eq(llmRuns.id, llmRunId)));
  return { ...run, apiServiceId: loaded.apiServiceId, input: loaded.data };
}

export async function completeReplayImpactExplanation(
  tx: DatabaseTransaction,
  organizationId: string,
  prepared: { id: string; apiServiceId: string; input: ReplayImpactPromptData },
  result: {
    output: ReplayImpactOutput;
    responseId: string | null;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    outputDigest: string;
    fallbackCode?: string;
  },
): Promise<void> {
  const completedAt = new Date();
  const excerpt = JSON.stringify({
    headline: result.output.headline,
    summary: result.output.summary,
    uncertainty: result.output.uncertainty,
    abstained: result.output.abstained,
    abstentionReason: result.output.abstentionReason,
  });
  if (excerpt.length > 8_000) throw new Error("Advisory excerpt exceeds persistence limit");
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
  const [draft] = await tx
    .insert(generatedDrafts)
    .values({
      organizationId,
      apiServiceId: prepared.apiServiceId,
      draftType: "impact_explanation",
      replayRunId: prepared.input.replayRunId,
      gateDecisionId: prepared.input.deterministicDecision.id,
      llmRunId: prepared.id,
      contentExcerpt: excerpt,
    })
    .returning({ id: generatedDrafts.id });
  if (!draft) throw new Error("Failed to persist advisory draft");
  if (result.output.citations.length > 0) {
    await tx.insert(llmCitations).values(
      result.output.citations.map((citation) => ({
        organizationId,
        llmRunId: prepared.id,
        ...(citation.resourceType === "receipt" ? { receiptId: citation.resourceId } : {}),
        ...(citation.resourceType === "dependency_claim"
          ? { dependencyClaimId: citation.resourceId }
          : {}),
        ...(citation.resourceType === "replay_delta" ? { replayDeltaId: citation.resourceId } : {}),
        ...(citation.resourceType === "behavior_definition"
          ? { behaviorDefinitionId: citation.resourceId }
          : {}),
        citationRole: citation.role,
        validated: true,
      })),
    );
  }
  const inputTokens = BigInt(result.inputTokens ?? 0);
  const outputTokens = BigInt(result.outputTokens ?? 0);
  await tx
    .insert(usageRollups)
    .values({
      organizationId,
      day: completedAt.toISOString().slice(0, 10),
      apiServiceId: prepared.apiServiceId,
      llmInputTokens: inputTokens,
      llmOutputTokens: outputTokens,
    })
    .onConflictDoUpdate({
      target: [usageRollups.organizationId, usageRollups.day, usageRollups.serviceScopeKey],
      set: {
        llmInputTokens: sql`${usageRollups.llmInputTokens} + ${inputTokens}`,
        llmOutputTokens: sql`${usageRollups.llmOutputTokens} + ${outputTokens}`,
        updatedAt: completedAt,
      },
    });
}

export async function getReplayImpactExplanation(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  replayRunId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({
        id: generatedDrafts.id,
        llmRunId: generatedDrafts.llmRunId,
        status: generatedDrafts.status,
        contentExcerpt: generatedDrafts.contentExcerpt,
        createdAt: generatedDrafts.createdAt,
        model: llmRuns.modelSnapshot,
        modelStatus: llmRuns.status,
        schemaValid: llmRuns.schemaValid,
        outputDigest: llmRuns.outputDigest,
        promptVersion: promptVersions.version,
        promptDigest: promptVersions.promptDigest,
        schemaDigest: promptVersions.schemaDigest,
      })
      .from(generatedDrafts)
      .innerJoin(
        llmRuns,
        and(
          eq(llmRuns.organizationId, generatedDrafts.organizationId),
          eq(llmRuns.id, generatedDrafts.llmRunId),
        ),
      )
      .innerJoin(promptVersions, eq(promptVersions.id, llmRuns.promptVersionId))
      .where(
        and(
          eq(generatedDrafts.organizationId, organizationId),
          eq(generatedDrafts.apiServiceId, apiServiceId),
          eq(generatedDrafts.replayRunId, replayRunId),
          eq(generatedDrafts.draftType, "impact_explanation"),
        ),
      )
      .orderBy(desc(generatedDrafts.createdAt))
      .limit(1);
    if (!row) return null;
    const citations = await tx
      .select({
        receiptId: llmCitations.receiptId,
        dependencyClaimId: llmCitations.dependencyClaimId,
        replayDeltaId: llmCitations.replayDeltaId,
        behaviorDefinitionId: llmCitations.behaviorDefinitionId,
        role: llmCitations.citationRole,
        validated: llmCitations.validated,
      })
      .from(llmCitations)
      .where(
        and(
          eq(llmCitations.organizationId, organizationId),
          eq(llmCitations.llmRunId, row.llmRunId),
          eq(llmCitations.validated, true),
        ),
      )
      .orderBy(llmCitations.createdAt);
    const parsed = JSON.parse(row.contentExcerpt) as {
      headline: string;
      summary: string;
      uncertainty: number;
      abstained: boolean;
      abstentionReason: string | null;
    };
    return {
      ...row,
      ...parsed,
      citations: citations.map((citation) => {
        if (citation.receiptId)
          return {
            resourceType: "receipt" as const,
            resourceId: citation.receiptId,
            role: citationRole(citation.role),
          };
        if (citation.dependencyClaimId)
          return {
            resourceType: "dependency_claim" as const,
            resourceId: citation.dependencyClaimId,
            role: citationRole(citation.role),
          };
        if (citation.replayDeltaId)
          return {
            resourceType: "replay_delta" as const,
            resourceId: citation.replayDeltaId,
            role: citationRole(citation.role),
          };
        if (citation.behaviorDefinitionId)
          return {
            resourceType: "behavior_definition" as const,
            resourceId: citation.behaviorDefinitionId,
            role: citationRole(citation.role),
          };
        throw new Error("Persisted advisory citation has no resource");
      }),
    };
  });
}
