import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  apiSpecOperations,
  apiSpecs,
  assertions,
  auditEvents,
  behaviorDefinitions,
  breakingChangeImpacts,
  breakingChangePlans,
  claimEvidence,
  consumers,
  dependencyClaims,
  generatedDrafts,
  jobs,
  llmCitations,
  llmRuns,
  organizations,
  promptVersions,
  storedObjects,
  usageRollups,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";
import { withOrganizationContext } from "./tenancy";

export type DraftTask = "spec_patch_draft" | "customer_notice_draft";
export type ProductDraftType = "spec_patch" | "customer_notice";
interface StoredObjectResult {
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  contentType: string;
  contentEncoding: string | null;
}

export interface DraftPromptData {
  planId: string | null;
  assertionId: string;
  plannedFor: string;
  reason: string;
  behavior: {
    id: string;
    label: string;
    kind: string;
    canonicalFingerprint: unknown;
  };
  operation: {
    method: string;
    pathTemplate: string;
    currentContract: unknown;
  };
  impacts: Array<{
    consumerAlias: string;
    evidenceTier: string;
    dependencyClaimId: string | null;
    receiptId: string | null;
    lastObservedAt: string;
  }>;
  citationResources: {
    behaviorDefinitionIds: string[];
    dependencyClaimIds: string[];
    receiptIds: string[];
  };
}

export interface PersistedDraftOutput {
  uncertainty: number;
  abstained: boolean;
  abstentionReason: string | null;
  citations: Array<{
    resourceType: "receipt" | "dependency_claim" | "replay_delta" | "behavior_definition";
    resourceId: string;
    role: "supports" | "context" | "counterexample";
  }>;
  [key: string]: unknown;
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

async function loadDraftInput(
  tx: DatabaseTransaction,
  organizationId: string,
  planId: string,
): Promise<{ apiServiceId: string; data: DraftPromptData } | null> {
  const [subject] = await tx
    .select({
      apiServiceId: breakingChangePlans.apiServiceId,
      assertionId: breakingChangePlans.assertionId,
      plannedFor: breakingChangePlans.plannedFor,
      reason: breakingChangePlans.reason,
      status: breakingChangePlans.status,
      behaviorId: behaviorDefinitions.id,
      behaviorLabel: behaviorDefinitions.defaultLabel,
      behaviorKind: behaviorDefinitions.kind,
      canonicalFingerprint: behaviorDefinitions.canonicalFingerprint,
      method: apiOperations.httpMethod,
      pathTemplate: apiOperations.normalizedPathTemplate,
      currentContract: apiSpecOperations.normalizedContract,
    })
    .from(breakingChangePlans)
    .innerJoin(
      behaviorDefinitions,
      and(
        eq(behaviorDefinitions.organizationId, breakingChangePlans.organizationId),
        eq(behaviorDefinitions.id, breakingChangePlans.behaviorDefinitionId),
      ),
    )
    .innerJoin(
      apiOperations,
      and(
        eq(apiOperations.organizationId, behaviorDefinitions.organizationId),
        eq(apiOperations.id, behaviorDefinitions.apiOperationId),
      ),
    )
    .leftJoin(
      apiSpecs,
      and(
        eq(apiSpecs.organizationId, breakingChangePlans.organizationId),
        eq(apiSpecs.apiServiceId, breakingChangePlans.apiServiceId),
        eq(apiSpecs.isCurrent, true),
      ),
    )
    .leftJoin(
      apiSpecOperations,
      and(
        eq(apiSpecOperations.organizationId, breakingChangePlans.organizationId),
        eq(apiSpecOperations.apiSpecId, apiSpecs.id),
        eq(apiSpecOperations.apiOperationId, apiOperations.id),
      ),
    )
    .where(
      and(
        eq(breakingChangePlans.organizationId, organizationId),
        eq(breakingChangePlans.id, planId),
      ),
    )
    .limit(1);
  if (!subject) return null;
  if (
    !(["scheduled", "communication_ready"] as const).includes(
      subject.status as "scheduled" | "communication_ready",
    )
  ) {
    throw new Error("Drafts require an active scheduled breaking-change plan");
  }
  const impacts = await tx
    .select({
      consumerAlias: consumers.displayAlias,
      evidenceTier: breakingChangeImpacts.evidenceTier,
      dependencyClaimId: breakingChangeImpacts.dependencyClaimId,
      receiptId: breakingChangeImpacts.receiptId,
      lastObservedAt: breakingChangeImpacts.lastObservedAt,
    })
    .from(breakingChangeImpacts)
    .innerJoin(
      consumers,
      and(
        eq(consumers.organizationId, breakingChangeImpacts.organizationId),
        eq(consumers.id, breakingChangeImpacts.consumerId),
      ),
    )
    .where(
      and(
        eq(breakingChangeImpacts.organizationId, organizationId),
        eq(breakingChangeImpacts.breakingChangePlanId, planId),
      ),
    );
  const claimIds = impacts.flatMap(({ dependencyClaimId }) =>
    dependencyClaimId ? [dependencyClaimId] : [],
  );
  const receiptIds = impacts.flatMap(({ receiptId }) => (receiptId ? [receiptId] : []));
  return {
    apiServiceId: subject.apiServiceId,
    data: {
      planId,
      assertionId: subject.assertionId,
      plannedFor: subject.plannedFor.toISOString(),
      reason: subject.reason,
      behavior: {
        id: subject.behaviorId,
        label: subject.behaviorLabel,
        kind: subject.behaviorKind,
        canonicalFingerprint: subject.canonicalFingerprint,
      },
      operation: {
        method: subject.method,
        pathTemplate: subject.pathTemplate,
        currentContract: subject.currentContract ?? null,
      },
      impacts: impacts.map((impact) => ({
        ...impact,
        lastObservedAt: impact.lastObservedAt.toISOString(),
      })),
      citationResources: {
        behaviorDefinitionIds: [subject.behaviorId],
        dependencyClaimIds: [...new Set(claimIds)],
        receiptIds: [...new Set(receiptIds)],
      },
    },
  };
}

async function loadAssertionDraftInput(
  tx: DatabaseTransaction,
  organizationId: string,
  assertionId: string,
): Promise<{ apiServiceId: string; data: DraftPromptData } | null> {
  const [subject] = await tx
    .select({
      apiServiceId: assertions.apiServiceId,
      expiresAt: assertions.expiresAt,
      reason: assertions.reason,
      status: assertions.status,
      behaviorId: behaviorDefinitions.id,
      behaviorLabel: behaviorDefinitions.defaultLabel,
      behaviorKind: behaviorDefinitions.kind,
      canonicalFingerprint: behaviorDefinitions.canonicalFingerprint,
      method: apiOperations.httpMethod,
      pathTemplate: apiOperations.normalizedPathTemplate,
      currentContract: apiSpecOperations.normalizedContract,
    })
    .from(assertions)
    .innerJoin(
      behaviorDefinitions,
      and(
        eq(behaviorDefinitions.organizationId, assertions.organizationId),
        eq(behaviorDefinitions.id, assertions.behaviorDefinitionId),
      ),
    )
    .innerJoin(
      apiOperations,
      and(
        eq(apiOperations.organizationId, behaviorDefinitions.organizationId),
        eq(apiOperations.id, behaviorDefinitions.apiOperationId),
      ),
    )
    .leftJoin(
      apiSpecs,
      and(
        eq(apiSpecs.organizationId, assertions.organizationId),
        eq(apiSpecs.apiServiceId, assertions.apiServiceId),
        eq(apiSpecs.isCurrent, true),
      ),
    )
    .leftJoin(
      apiSpecOperations,
      and(
        eq(apiSpecOperations.organizationId, assertions.organizationId),
        eq(apiSpecOperations.apiSpecId, apiSpecs.id),
        eq(apiSpecOperations.apiOperationId, apiOperations.id),
      ),
    )
    .where(and(eq(assertions.organizationId, organizationId), eq(assertions.id, assertionId)))
    .limit(1);
  if (!subject) return null;
  if (subject.status !== "active" && subject.status !== "expiring")
    throw new Error("Spec drafts require an active assertion");
  const impacts = await tx
    .select({
      consumerAlias: consumers.displayAlias,
      evidenceTier: dependencyClaims.tier,
      dependencyClaimId: dependencyClaims.id,
      receiptId: claimEvidence.receiptId,
      lastObservedAt: dependencyClaims.effectiveFrom,
    })
    .from(dependencyClaims)
    .innerJoin(
      consumers,
      and(
        eq(consumers.organizationId, dependencyClaims.organizationId),
        eq(consumers.id, dependencyClaims.consumerId),
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
    .where(
      and(
        eq(dependencyClaims.organizationId, organizationId),
        eq(dependencyClaims.apiServiceId, subject.apiServiceId),
        eq(dependencyClaims.behaviorDefinitionId, subject.behaviorId),
        eq(dependencyClaims.status, "active"),
      ),
    );
  const claimIds = [...new Set(impacts.map(({ dependencyClaimId }) => dependencyClaimId))];
  const receiptIds = [
    ...new Set(impacts.flatMap(({ receiptId }) => (receiptId ? [receiptId] : []))),
  ];
  return {
    apiServiceId: subject.apiServiceId,
    data: {
      planId: null,
      assertionId,
      plannedFor: subject.expiresAt.toISOString(),
      reason: subject.reason,
      behavior: {
        id: subject.behaviorId,
        label: subject.behaviorLabel,
        kind: subject.behaviorKind,
        canonicalFingerprint: subject.canonicalFingerprint,
      },
      operation: {
        method: subject.method,
        pathTemplate: subject.pathTemplate,
        currentContract: subject.currentContract ?? null,
      },
      impacts: impacts.map((impact) => ({
        ...impact,
        lastObservedAt: impact.lastObservedAt.toISOString(),
      })),
      citationResources: {
        behaviorDefinitionIds: [subject.behaviorId],
        dependencyClaimIds: claimIds,
        receiptIds,
      },
    },
  };
}

export async function requestProductDraft(
  db: Database,
  organizationId: string,
  subjectId: string,
  task: DraftTask,
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
    const loaded =
      task === "spec_patch_draft"
        ? ((await loadDraftInput(tx, organizationId, subjectId)) ??
          (await loadAssertionDraftInput(tx, organizationId, subjectId)))
        : await loadDraftInput(tx, organizationId, subjectId);
    if (!loaded) return null;
    await tx
      .insert(promptVersions)
      .values({
        taskType: task,
        version: prompt.version,
        modelFamily: "gpt-5.6",
        promptDigest: prompt.promptDigest,
        schemaDigest: prompt.schemaDigest,
        sourceRevision: prompt.sourceRevision,
        status: "evaluated",
      })
      .onConflictDoNothing({ target: [promptVersions.taskType, promptVersions.version] });
    const [version] = await tx
      .select({ id: promptVersions.id })
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.taskType, task),
          eq(promptVersions.version, prompt.version),
          eq(promptVersions.promptDigest, prompt.promptDigest),
          eq(promptVersions.schemaDigest, prompt.schemaDigest),
        ),
      )
      .limit(1);
    if (!version) throw new Error("The configured prompt version conflicts with the database");
    const inputDigest = digest(loaded.data);
    const cacheKey = digest({ inputDigest, model: prompt.model, schema: prompt.schemaDigest });
    const [existing] = await tx
      .select({ id: llmRuns.id, status: llmRuns.status })
      .from(llmRuns)
      .where(
        and(
          eq(llmRuns.organizationId, organizationId),
          eq(llmRuns.taskType, task),
          eq(llmRuns.promptVersionId, version.id),
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
        taskType: task,
        promptVersionId: version.id,
        model: prompt.model,
        modelSnapshot: prompt.model,
        reasoningEffort: "medium",
        inputDigest,
        cacheKey,
      })
      .returning({ id: llmRuns.id, status: llmRuns.status });
    if (!run) throw new Error("Failed to create draft run");
    await Promise.all([
      tx.insert(jobs).values({
        organizationId,
        type: "generate_product_draft",
        payload: { llmRunId: run.id, subjectId, task },
        idempotencyKey: `product-draft:${run.id}`,
        concurrencyKey: `openai:${organizationId}`,
        maxAttempts: 3,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: new Date(),
        actorType: "user",
        actorId: actor.userId,
        action: `advisory.${task}_requested`,
        resourceType: "llm_run",
        resourceId: run.id,
        requestId: actor.requestId,
        changes: { subjectId, inputDigest, promptVersion: prompt.version },
        outcome: "succeeded",
      }),
    ]);
    return run;
  });
}

export async function prepareProductDraft(
  tx: DatabaseTransaction,
  organizationId: string,
  llmRunId: string,
  subjectId: string,
  task: DraftTask,
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
        eq(llmRuns.taskType, task),
      ),
    )
    .limit(1);
  if (!run || run.status === "succeeded" || run.status === "rejected") return null;
  const loaded =
    task === "spec_patch_draft"
      ? ((await loadDraftInput(tx, organizationId, subjectId)) ??
        (await loadAssertionDraftInput(tx, organizationId, subjectId)))
      : await loadDraftInput(tx, organizationId, subjectId);
  if (!loaded || digest(loaded.data) !== run.inputDigest)
    throw new Error("Draft input no longer matches its immutable digest");
  await tx
    .update(llmRuns)
    .set({ status: "running", startedAt: new Date(), failureCode: null })
    .where(and(eq(llmRuns.organizationId, organizationId), eq(llmRuns.id, llmRunId)));
  return { ...run, apiServiceId: loaded.apiServiceId, input: loaded.data };
}

export async function completeProductDraft(
  tx: DatabaseTransaction,
  organizationId: string,
  prepared: { id: string; apiServiceId: string; input: DraftPromptData },
  task: DraftTask,
  result: {
    output: PersistedDraftOutput;
    object: StoredObjectResult;
    responseId: string | null;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    outputDigest: string;
    fallbackCode?: string;
  },
): Promise<boolean> {
  const completedAt = new Date();
  const [organization] = await tx
    .select({ retentionDays: organizations.retentionDays })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!organization) throw new Error("Organization retention configuration is missing");
  const [insertedObject] = await tx
    .insert(storedObjects)
    .values({
      organizationId,
      kind: "generated_artifact",
      bucket: result.object.bucket,
      objectKey: result.object.objectKey,
      contentType: result.object.contentType,
      contentEncoding: result.object.contentEncoding,
      byteSize: BigInt(result.object.byteSize),
      sha256Digest: result.object.sha256Digest,
      scanStatus: "clean",
      scannedAt: completedAt,
      availabilityStatus: "available",
      verifiedAt: completedAt,
      expiresAt: new Date(completedAt.getTime() + organization.retentionDays * 86_400_000),
      createdByActorType: "system",
      createdByActorId: "worker:product-draft",
    })
    .onConflictDoNothing()
    .returning({ id: storedObjects.id, objectKey: storedObjects.objectKey });
  const [existingObject] = insertedObject
    ? [insertedObject]
    : await tx
        .select({ id: storedObjects.id, objectKey: storedObjects.objectKey })
        .from(storedObjects)
        .where(
          and(
            eq(storedObjects.organizationId, organizationId),
            eq(storedObjects.kind, "generated_artifact"),
            eq(storedObjects.sha256Digest, result.object.sha256Digest),
            eq(storedObjects.availabilityStatus, "available"),
            sql`${storedObjects.deletedAt} is null`,
          ),
        )
        .limit(1);
  const object = insertedObject ?? existingObject;
  if (!object) throw new Error("Failed to persist generated artifact object");
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
  const draftType: ProductDraftType =
    task === "spec_patch_draft" ? "spec_patch" : "customer_notice";
  const excerpt = stableJson({
    draftType,
    uncertainty: result.output.uncertainty,
    abstained: result.output.abstained,
    abstentionReason: result.output.abstentionReason,
  }).slice(0, 8_000);
  await tx.insert(generatedDrafts).values({
    organizationId,
    apiServiceId: prepared.apiServiceId,
    draftType,
    behaviorDefinitionId: prepared.input.behavior.id,
    assertionId: prepared.input.assertionId,
    breakingChangePlanId: prepared.input.planId,
    llmRunId: prepared.id,
    contentObjectId: object.id,
    contentExcerpt: excerpt,
  });
  if (result.output.citations.length)
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
  if (draftType === "customer_notice") {
    if (!prepared.input.planId)
      throw new Error("Customer notice draft has no breaking-change plan");
    await tx
      .update(breakingChangeImpacts)
      .set({ communicationStatus: "drafted", updatedAt: completedAt })
      .where(
        and(
          eq(breakingChangeImpacts.organizationId, organizationId),
          eq(breakingChangeImpacts.breakingChangePlanId, prepared.input.planId),
          eq(breakingChangeImpacts.communicationStatus, "pending"),
        ),
      );
  }
  const inputTokens = BigInt(result.inputTokens ?? 0),
    outputTokens = BigInt(result.outputTokens ?? 0);
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
  return object.objectKey === result.object.objectKey;
}

export async function getProductDraft(
  db: Database,
  organizationId: string,
  subjectId: string,
  draftType: ProductDraftType,
  subjectType: "plan" | "assertion" = "plan",
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({
        id: generatedDrafts.id,
        llmRunId: generatedDrafts.llmRunId,
        draftType: generatedDrafts.draftType,
        status: generatedDrafts.status,
        createdAt: generatedDrafts.createdAt,
        model: llmRuns.modelSnapshot,
        modelStatus: llmRuns.status,
        schemaValid: llmRuns.schemaValid,
        outputDigest: llmRuns.outputDigest,
        abstentionReason: llmRuns.abstentionReason,
        promptVersion: promptVersions.version,
        objectKey: storedObjects.objectKey,
        byteSize: storedObjects.byteSize,
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
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.organizationId, generatedDrafts.organizationId),
          eq(storedObjects.id, generatedDrafts.contentObjectId),
        ),
      )
      .where(
        and(
          eq(generatedDrafts.organizationId, organizationId),
          subjectType === "plan"
            ? eq(generatedDrafts.breakingChangePlanId, subjectId)
            : eq(generatedDrafts.assertionId, subjectId),
          eq(generatedDrafts.draftType, draftType),
        ),
      )
      .orderBy(desc(generatedDrafts.createdAt))
      .limit(1);
    if (!row) return null;
    const citations = await tx
      .select({
        receiptId: llmCitations.receiptId,
        dependencyClaimId: llmCitations.dependencyClaimId,
        behaviorDefinitionId: llmCitations.behaviorDefinitionId,
        role: llmCitations.citationRole,
      })
      .from(llmCitations)
      .where(
        and(
          eq(llmCitations.organizationId, organizationId),
          eq(llmCitations.llmRunId, row.llmRunId),
          eq(llmCitations.validated, true),
        ),
      );
    return { ...row, citations };
  });
}

export async function reviewProductDraft(
  db: Database,
  organizationId: string,
  draftId: string,
  membershipId: string,
  actorId: string,
  requestId: string,
  decision: "accept" | "reject",
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const [draft] = await tx
      .update(generatedDrafts)
      .set({
        status: decision === "accept" ? "accepted" : "rejected",
        reviewedByMembershipId: membershipId,
        reviewedAt: now,
      })
      .where(
        and(
          eq(generatedDrafts.organizationId, organizationId),
          eq(generatedDrafts.id, draftId),
          eq(generatedDrafts.status, "draft"),
        ),
      )
      .returning({
        id: generatedDrafts.id,
        draftType: generatedDrafts.draftType,
        planId: generatedDrafts.breakingChangePlanId,
      });
    if (!draft) return null;
    if (decision === "accept" && draft.draftType === "customer_notice" && draft.planId) {
      await tx
        .update(breakingChangePlans)
        .set({ status: "communication_ready", updatedAt: now })
        .where(
          and(
            eq(breakingChangePlans.organizationId, organizationId),
            eq(breakingChangePlans.id, draft.planId),
            eq(breakingChangePlans.status, "scheduled"),
          ),
        );
      await tx
        .update(breakingChangeImpacts)
        .set({ communicationStatus: "reviewed", updatedAt: now })
        .where(
          and(
            eq(breakingChangeImpacts.organizationId, organizationId),
            eq(breakingChangeImpacts.breakingChangePlanId, draft.planId),
            eq(breakingChangeImpacts.communicationStatus, "drafted"),
          ),
        );
    }
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: now,
      actorType: "user",
      actorId,
      action: `generated_draft.${decision}ed`,
      resourceType: "generated_draft",
      resourceId: draft.id,
      requestId,
      changes: { decision },
      outcome: "succeeded",
    });
    return draft;
  });
}
