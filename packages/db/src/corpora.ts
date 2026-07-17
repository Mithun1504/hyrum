import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  assertionConsumers,
  assertions,
  auditEvents,
  behaviorDefinitions,
  claimEvidence,
  corpusItems,
  dependencyClaims,
  extractorReleases,
  jobs,
  ledgerEntries,
  organizations,
  receipts,
  replayCorpora,
  replayProfiles,
  serviceEnvironments,
  storedObjects,
} from "./schema";
import { type DatabaseTransaction, withOrganizationContext } from "./tenancy";

export interface CorpusCandidate {
  behaviorDefinitionId: string;
  assertionId: string | null;
  apiOperationId: string;
  operationKey: string;
  normalizedPathTemplate: string;
  extractorReleaseId: string;
  consumerId: string;
  coverageClass: "shape" | "ordering" | "error_template" | "assertion";
  behaviorKind: "shape" | "ordering" | "error_template";
  objectKey: string;
  byteSize: number;
  observedAt: Date;
}

export async function listCorpusCandidates(
  tx: DatabaseTransaction,
  organizationId: string,
  apiServiceId: string,
): Promise<CorpusCandidate[]> {
  const now = new Date();
  const rows = await tx
    .select({
      behaviorDefinitionId: behaviorDefinitions.id,
      behaviorKind: behaviorDefinitions.kind,
      apiOperationId: apiOperations.id,
      operationKey: apiOperations.operationKey,
      normalizedPathTemplate: apiOperations.normalizedPathTemplate,
      extractorReleaseId: receipts.extractorReleaseId,
      consumerId: dependencyClaims.consumerId,
      objectKey: storedObjects.objectKey,
      byteSize: storedObjects.byteSize,
      observedAt: ledgerEntries.lastObservedAt,
    })
    .from(dependencyClaims)
    .innerJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.organizationId, dependencyClaims.organizationId),
        eq(ledgerEntries.dependencyClaimId, dependencyClaims.id),
        ne(ledgerEntries.reviewState, "dismissed"),
      ),
    )
    .innerJoin(
      behaviorDefinitions,
      and(
        eq(behaviorDefinitions.organizationId, dependencyClaims.organizationId),
        eq(behaviorDefinitions.id, dependencyClaims.behaviorDefinitionId),
      ),
    )
    .innerJoin(
      apiOperations,
      and(
        eq(apiOperations.organizationId, behaviorDefinitions.organizationId),
        eq(apiOperations.id, behaviorDefinitions.apiOperationId),
      ),
    )
    .innerJoin(
      claimEvidence,
      and(
        eq(claimEvidence.organizationId, dependencyClaims.organizationId),
        eq(claimEvidence.dependencyClaimId, dependencyClaims.id),
        eq(claimEvidence.evidenceRole, "primary"),
      ),
    )
    .innerJoin(
      receipts,
      and(
        eq(receipts.organizationId, claimEvidence.organizationId),
        eq(receipts.id, claimEvidence.receiptId),
        eq(receipts.availabilityStatus, "available"),
        gt(receipts.expiresAt, now),
      ),
    )
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.organizationId, receipts.organizationId),
        eq(storedObjects.id, receipts.storedObjectId),
        eq(storedObjects.availabilityStatus, "available"),
        isNull(storedObjects.deletedAt),
      ),
    )
    .where(
      and(
        eq(dependencyClaims.organizationId, organizationId),
        eq(dependencyClaims.apiServiceId, apiServiceId),
        eq(dependencyClaims.status, "active"),
      ),
    )
    .orderBy(desc(ledgerEntries.lastObservedAt), desc(claimEvidence.createdAt))
    .limit(5_000);
  const activeAssertions = await tx
    .select({
      id: assertions.id,
      behaviorDefinitionId: assertions.behaviorDefinitionId,
      scope: assertions.scope,
    })
    .from(assertions)
    .where(
      and(
        eq(assertions.organizationId, organizationId),
        eq(assertions.apiServiceId, apiServiceId),
        inArray(assertions.status, ["active", "expiring"]),
        gt(assertions.expiresAt, now),
      ),
    );
  const assertionIds = activeAssertions.map(({ id }) => id);
  const scopeRows = assertionIds.length
    ? await tx
        .select({
          assertionId: assertionConsumers.assertionId,
          consumerId: assertionConsumers.consumerId,
        })
        .from(assertionConsumers)
        .where(
          and(
            eq(assertionConsumers.organizationId, organizationId),
            inArray(assertionConsumers.assertionId, assertionIds),
          ),
        )
    : [];
  const scopes = new Map<string, Set<string>>();
  for (const row of scopeRows) {
    const values = scopes.get(row.assertionId) ?? new Set<string>();
    values.add(row.consumerId);
    scopes.set(row.assertionId, values);
  }
  const byBehavior = new Map<string, typeof activeAssertions>();
  for (const assertion of activeAssertions) {
    byBehavior.set(assertion.behaviorDefinitionId, [
      ...(byBehavior.get(assertion.behaviorDefinitionId) ?? []),
      assertion,
    ]);
  }
  const result: CorpusCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.byteSize > BigInt(Number.MAX_SAFE_INTEGER)) continue;
    const base = `${row.behaviorDefinitionId}:${row.consumerId}:${row.objectKey}:${row.behaviorKind}`;
    if (!seen.has(base)) {
      seen.add(base);
      result.push({
        behaviorDefinitionId: row.behaviorDefinitionId,
        assertionId: null,
        apiOperationId: row.apiOperationId,
        operationKey: row.operationKey,
        normalizedPathTemplate: row.normalizedPathTemplate,
        extractorReleaseId: row.extractorReleaseId,
        consumerId: row.consumerId,
        behaviorKind: row.behaviorKind,
        coverageClass: row.behaviorKind,
        objectKey: row.objectKey,
        byteSize: Number(row.byteSize),
        observedAt: row.observedAt,
      });
    }
    for (const assertion of byBehavior.get(row.behaviorDefinitionId) ?? []) {
      if (
        assertion.scope === "selected_consumers" &&
        !scopes.get(assertion.id)?.has(row.consumerId)
      )
        continue;
      const key = `${assertion.id}:${row.consumerId}:${row.objectKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        behaviorDefinitionId: row.behaviorDefinitionId,
        assertionId: assertion.id,
        apiOperationId: row.apiOperationId,
        operationKey: row.operationKey,
        normalizedPathTemplate: row.normalizedPathTemplate,
        extractorReleaseId: row.extractorReleaseId,
        consumerId: row.consumerId,
        behaviorKind: row.behaviorKind,
        coverageClass: "assertion",
        objectKey: row.objectKey,
        byteSize: Number(row.byteSize),
        observedAt: row.observedAt,
      });
    }
  }
  return result.sort((left, right) =>
    `${left.coverageClass}:${left.operationKey}:${left.consumerId}:${left.behaviorDefinitionId}`.localeCompare(
      `${right.coverageClass}:${right.operationKey}:${right.consumerId}:${right.behaviorDefinitionId}`,
    ),
  );
}

export interface CorpusItemInput {
  apiOperationId: string;
  consumerId: string;
  behaviorDefinitionId: string;
  assertionId: string | null;
  coverageClass: "shape" | "ordering" | "error_template" | "assertion";
  objectOffset: bigint;
  requestDigest: string;
  method: string;
  normalizedPath: string;
  safeMethod: boolean;
  requiresFixture: boolean;
  selectionReason: string;
  priorityRank: number;
}

export interface CorpusObjectDescriptor {
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  contentType: string;
  contentEncoding: string | null;
}

export async function persistReplayCorpus(
  tx: DatabaseTransaction,
  organizationId: string,
  apiServiceId: string,
  object: CorpusObjectDescriptor,
  items: readonly CorpusItemInput[],
  sourceWindow: { start: Date; end: Date },
): Promise<{ id: string; version: number; created: boolean; retainedObjectKey: string }> {
  const [existing] = await tx
    .select({
      id: replayCorpora.id,
      version: replayCorpora.version,
      objectKey: storedObjects.objectKey,
    })
    .from(replayCorpora)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.organizationId, replayCorpora.organizationId),
        eq(storedObjects.id, replayCorpora.storedObjectId),
      ),
    )
    .where(
      and(
        eq(replayCorpora.organizationId, organizationId),
        eq(replayCorpora.corpusDigest, object.sha256Digest),
      ),
    )
    .limit(1);
  if (existing) return { ...existing, created: false, retainedObjectKey: existing.objectKey };
  const [environment] = await tx
    .select({ id: serviceEnvironments.id })
    .from(serviceEnvironments)
    .where(
      and(
        eq(serviceEnvironments.organizationId, organizationId),
        eq(serviceEnvironments.apiServiceId, apiServiceId),
        eq(serviceEnvironments.isDefault, true),
        isNull(serviceEnvironments.deletedAt),
      ),
    )
    .limit(1);
  const [extractor] = await tx
    .select({ id: extractorReleases.id })
    .from(extractorReleases)
    .where(isNull(extractorReleases.deprecatedAt))
    .orderBy(desc(extractorReleases.releasedAt))
    .limit(1);
  const [organization] = await tx
    .select({ retentionDays: organizations.retentionDays })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!environment || !extractor || !organization)
    throw new Error("Corpus configuration is incomplete");
  const [latest] = await tx
    .select({ id: replayCorpora.id, version: replayCorpora.version })
    .from(replayCorpora)
    .where(
      and(
        eq(replayCorpora.organizationId, organizationId),
        eq(replayCorpora.environmentId, environment.id),
      ),
    )
    .orderBy(desc(replayCorpora.version))
    .limit(1);
  const expiresAt = new Date(Date.now() + organization.retentionDays * 86_400_000);
  const [stored] = await tx
    .insert(storedObjects)
    .values({
      organizationId,
      kind: "replay_corpus",
      bucket: object.bucket,
      objectKey: object.objectKey,
      contentType: object.contentType,
      contentEncoding: object.contentEncoding,
      byteSize: BigInt(object.byteSize),
      sha256Digest: object.sha256Digest,
      scanStatus: "not_required",
      availabilityStatus: "available",
      expiresAt,
      verifiedAt: new Date(),
      createdByActorType: "system",
      createdByActorId: "worker:build_replay_corpus",
    })
    .returning({ id: storedObjects.id });
  if (!stored) throw new Error("Corpus object registration returned no record");
  if (latest) {
    await tx
      .update(replayCorpora)
      .set({ status: "superseded" })
      .where(eq(replayCorpora.id, latest.id));
  }
  const [corpus] = await tx
    .insert(replayCorpora)
    .values({
      organizationId,
      apiServiceId,
      environmentId: environment.id,
      version: (latest?.version ?? 0) + 1,
      status: "ready",
      storedObjectId: stored.id,
      corpusDigest: object.sha256Digest,
      extractorReleaseId: extractor.id,
      selectionAlgorithmVersion: "coverage-reservoir-v1",
      sourceWindowStart: sourceWindow.start,
      sourceWindowEnd: sourceWindow.end,
      itemCount: items.length,
      operationCount: new Set(items.map(({ apiOperationId }) => apiOperationId)).size,
      consumerCount: new Set(items.map(({ consumerId }) => consumerId)).size,
      assertionCount: new Set(
        items.flatMap(({ assertionId }) => (assertionId ? [assertionId] : [])),
      ).size,
      expiresAt,
      supersedesCorpusId: latest?.id,
    })
    .returning({ id: replayCorpora.id, version: replayCorpora.version });
  if (!corpus) throw new Error("Corpus creation returned no record");
  if (items.length) {
    await tx
      .insert(corpusItems)
      .values(items.map((item) => ({ organizationId, replayCorpusId: corpus.id, ...item })));
  }
  return { ...corpus, created: true, retainedObjectKey: object.objectKey };
}

export async function listReplayCorpora(
  tx: DatabaseTransaction,
  organizationId: string,
  apiServiceId: string,
) {
  const corpora = await tx
    .select({
      id: replayCorpora.id,
      version: replayCorpora.version,
      status: replayCorpora.status,
      corpusDigest: replayCorpora.corpusDigest,
      itemCount: replayCorpora.itemCount,
      operationCount: replayCorpora.operationCount,
      consumerCount: replayCorpora.consumerCount,
      assertionCount: replayCorpora.assertionCount,
      sourceWindowStart: replayCorpora.sourceWindowStart,
      sourceWindowEnd: replayCorpora.sourceWindowEnd,
      expiresAt: replayCorpora.expiresAt,
      createdAt: replayCorpora.createdAt,
    })
    .from(replayCorpora)
    .where(
      and(
        eq(replayCorpora.organizationId, organizationId),
        eq(replayCorpora.apiServiceId, apiServiceId),
      ),
    )
    .orderBy(desc(replayCorpora.version));
  if (corpora.length === 0) return [];
  const items = await tx
    .select({
      replayCorpusId: corpusItems.replayCorpusId,
      assertionId: corpusItems.assertionId,
      requiresFixture: corpusItems.requiresFixture,
    })
    .from(corpusItems)
    .where(
      and(
        eq(corpusItems.organizationId, organizationId),
        inArray(
          corpusItems.replayCorpusId,
          corpora.map(({ id }) => id),
        ),
      ),
    );
  const summaries = new Map<string, { assertionIds: Set<string>; fixtureRequiredCount: number }>();
  for (const item of items) {
    const summary = summaries.get(item.replayCorpusId) ?? {
      assertionIds: new Set<string>(),
      fixtureRequiredCount: 0,
    };
    if (item.assertionId) summary.assertionIds.add(item.assertionId);
    if (item.requiresFixture) summary.fixtureRequiredCount += 1;
    summaries.set(item.replayCorpusId, summary);
  }
  return corpora.map((corpus) => ({
    ...corpus,
    fixtureRequiredCount: summaries.get(corpus.id)?.fixtureRequiredCount ?? 0,
    includedAssertionIds: [...(summaries.get(corpus.id)?.assertionIds ?? [])].sort(),
  }));
}

export async function getActiveReplayProfile(
  tx: DatabaseTransaction,
  organizationId: string,
  apiServiceId: string,
) {
  const [profile] = await tx
    .select({
      id: replayProfiles.id,
      version: replayProfiles.version,
      name: replayProfiles.name,
      allowedOperationMode: replayProfiles.allowedOperationMode,
      networkEgressEnabled: replayProfiles.networkEgressEnabled,
      requestTimeoutMs: replayProfiles.requestTimeoutMs,
      resourceLimits: replayProfiles.resourceLimits,
      fixtureObjectId: replayProfiles.fixtureObjectId,
      stubObjectId: replayProfiles.stubObjectId,
      configDigest: replayProfiles.configDigest,
    })
    .from(replayProfiles)
    .where(
      and(
        eq(replayProfiles.organizationId, organizationId),
        eq(replayProfiles.apiServiceId, apiServiceId),
        eq(replayProfiles.status, "active"),
      ),
    )
    .limit(1);
  if (!profile) return null;
  const { fixtureObjectId, stubObjectId, ...record } = profile;
  return {
    ...record,
    resourceLimits:
      profile.resourceLimits !== null &&
      typeof profile.resourceLimits === "object" &&
      !Array.isArray(profile.resourceLimits)
        ? (profile.resourceLimits as Record<string, unknown>)
        : {},
    fixtureConfigured: fixtureObjectId !== null,
    stubConfigured: stubObjectId !== null,
  };
}

export async function requestReplayCorpusBuild(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  actor: {
    userId: string;
    requestId: string;
    actorType?: "user" | "platform_operator";
    supportAccessGrantId?: string;
  },
): Promise<{ jobId: string }> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [job] = await tx
      .insert(jobs)
      .values({
        organizationId,
        type: "build_replay_corpus",
        payload: { apiServiceId, reason: "manual" },
        idempotencyKey: `corpus-manual:${apiServiceId}:${actor.requestId}`,
        concurrencyKey: `corpus:${apiServiceId}`,
        maxAttempts: 3,
      })
      .returning({ id: jobs.id });
    if (!job) throw new Error("Corpus build request returned no job");
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: actor.actorType ?? "user",
      actorId: actor.userId,
      supportAccessGrantId: actor.supportAccessGrantId,
      action: "replay_corpus.build_requested",
      resourceType: "api_service",
      resourceId: apiServiceId,
      requestId: actor.requestId,
      changes: { jobId: job.id },
      outcome: "succeeded",
    });
    return { jobId: job.id };
  });
}

export async function authorizeReplayCorpusRead(
  db: Database,
  organizationId: string,
  corpusId: string,
  actor: {
    userId: string;
    requestId: string;
    actorType?: "user" | "platform_operator";
    supportAccessGrantId?: string;
  },
): Promise<{ bucket: string; objectKey: string; corpusDigest: string } | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const [record] = await tx
      .select({
        bucket: storedObjects.bucket,
        objectKey: storedObjects.objectKey,
        corpusDigest: replayCorpora.corpusDigest,
      })
      .from(replayCorpora)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.organizationId, replayCorpora.organizationId),
          eq(storedObjects.id, replayCorpora.storedObjectId),
        ),
      )
      .where(
        and(
          eq(replayCorpora.organizationId, organizationId),
          eq(replayCorpora.id, corpusId),
          eq(replayCorpora.status, "ready"),
          gt(replayCorpora.expiresAt, now),
          eq(storedObjects.availabilityStatus, "available"),
          gt(storedObjects.expiresAt, now),
          isNull(storedObjects.deletedAt),
        ),
      )
      .limit(1);
    if (!record) return null;
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: now,
      actorType: actor.actorType ?? "user",
      actorId: actor.userId,
      supportAccessGrantId: actor.supportAccessGrantId,
      action: "replay_corpus.accessed",
      resourceType: "replay_corpus",
      resourceId: corpusId,
      requestId: actor.requestId,
      changes: {},
      outcome: "succeeded",
    });
    return record;
  });
}
