import type { ProcessedCaptureSession } from "@hyrum/contracts";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  apiOperations,
  apiSpecOperations,
  apiSpecs,
  behaviorDefinitions,
  behaviorObservations,
  behaviorSpecClassifications,
  captureSessions,
  consumerIdentifiers,
  consumers,
  ingestionBatches,
  organizationSettings,
  redactionPolicyVersions,
  samplingPolicyVersions,
  storedObjects,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";

export interface ProcessableIngestionBatch {
  id: string;
  objectKey: string;
  bucket: string;
  byteSize: number;
}

export interface ReceiptBundleObject {
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  contentType: string;
  contentEncoding: string | null;
}

export async function getProcessableIngestionBatch(
  tx: DatabaseTransaction,
  organizationId: string,
  ingestionBatchId: string,
): Promise<ProcessableIngestionBatch | null> {
  const [record] = await tx
    .select({
      id: ingestionBatches.id,
      objectKey: storedObjects.objectKey,
      bucket: storedObjects.bucket,
      byteSize: storedObjects.byteSize,
    })
    .from(ingestionBatches)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.organizationId, ingestionBatches.organizationId),
        eq(storedObjects.id, ingestionBatches.storedObjectId),
        eq(storedObjects.availabilityStatus, "available"),
        isNull(storedObjects.deletedAt),
      ),
    )
    .where(
      and(
        eq(ingestionBatches.organizationId, organizationId),
        eq(ingestionBatches.id, ingestionBatchId),
        inArray(ingestionBatches.status, ["validated", "partially_rejected", "processing"]),
      ),
    )
    .limit(1);
  if (!record) return null;
  if (record.byteSize > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Capture object is too large");
  return { ...record, byteSize: Number(record.byteSize) };
}

function completeness(value: ProcessedCaptureSession["completeness"]) {
  if (value === "complete") return "complete" as const;
  if (value === "truncated") return "partial_end" as const;
  return "gapped" as const;
}

function dayBucket(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export async function processIngestionSessions(
  tx: DatabaseTransaction,
  organizationId: string,
  ingestionBatchId: string,
  sessions: readonly ProcessedCaptureSession[],
  receiptBundles: ReadonlyMap<string, ReceiptBundleObject>,
): Promise<{
  processedSessions: number;
  processedFingerprints: number;
  behaviorDefinitionIds: string[];
  retainedReceiptObjectKeys: string[];
}> {
  const [batch] = await tx
    .select({
      id: ingestionBatches.id,
      status: ingestionBatches.status,
      apiServiceId: ingestionBatches.apiServiceId,
      environmentId: ingestionBatches.environmentId,
      agentId: ingestionBatches.agentId,
      storedObjectId: ingestionBatches.storedObjectId,
      extractorReleaseId: ingestionBatches.extractorReleaseId,
      redactionPolicyVersionId: ingestionBatches.redactionPolicyVersionId,
      consumerHmacKeyVersionId: redactionPolicyVersions.consumerHmacKeyVersionId,
      structuralHmacKeyVersionId: redactionPolicyVersions.structuralHmacKeyVersionId,
      lowVolumeThreshold: samplingPolicyVersions.lowVolumeThreshold,
      receiptTtlDays: organizationSettings.defaultReceiptTtlDays,
    })
    .from(ingestionBatches)
    .innerJoin(
      redactionPolicyVersions,
      and(
        eq(redactionPolicyVersions.organizationId, ingestionBatches.organizationId),
        eq(redactionPolicyVersions.id, ingestionBatches.redactionPolicyVersionId),
      ),
    )
    .innerJoin(
      samplingPolicyVersions,
      and(
        eq(samplingPolicyVersions.organizationId, ingestionBatches.organizationId),
        eq(samplingPolicyVersions.id, ingestionBatches.samplingPolicyVersionId),
      ),
    )
    .innerJoin(
      organizationSettings,
      eq(organizationSettings.organizationId, ingestionBatches.organizationId),
    )
    .where(
      and(
        eq(ingestionBatches.organizationId, organizationId),
        eq(ingestionBatches.id, ingestionBatchId),
      ),
    )
    .limit(1);
  if (!batch) throw new Error("Ingestion batch not found");
  if (batch.status === "processed") {
    return {
      processedSessions: 0,
      processedFingerprints: 0,
      behaviorDefinitionIds: [],
      retainedReceiptObjectKeys: [],
    };
  }
  if (
    !(["validated", "partially_rejected", "processing"] as const).includes(batch.status as never)
  ) {
    throw new Error(`Ingestion batch cannot be processed from status ${batch.status}`);
  }
  await tx
    .update(ingestionBatches)
    .set({ status: "processing", failureCode: null })
    .where(eq(ingestionBatches.id, batch.id));

  const operationKeys = [
    ...new Set(sessions.flatMap((session) => session.exchanges.map((item) => item.operation_key))),
  ];
  const operationRows = operationKeys.length
    ? await tx
        .select({ id: apiOperations.id, operationKey: apiOperations.operationKey })
        .from(apiOperations)
        .where(
          and(
            eq(apiOperations.organizationId, organizationId),
            eq(apiOperations.apiServiceId, batch.apiServiceId),
            inArray(apiOperations.operationKey, operationKeys),
          ),
        )
    : [];
  const operations = new Map(
    operationRows.map((operation) => [operation.operationKey, operation.id]),
  );
  const missingOperation = operationKeys.find((key) => !operations.has(key));
  if (missingOperation)
    throw new Error(`Capture references unknown operation key ${missingOperation}`);

  let processedSessions = 0;
  let processedFingerprints = 0;
  const behaviorDefinitionIds = new Set<string>();
  const retainedReceiptObjectKeys = new Set<string>();
  for (const session of sessions) {
    const startedAt = new Date(session.started_at);
    const endedAt = new Date(session.ended_at);
    const eventCount = session.exchanges.length;
    const [existingIdentifier] = await tx
      .select({ consumerId: consumerIdentifiers.consumerId })
      .from(consumerIdentifiers)
      .where(
        and(
          eq(consumerIdentifiers.organizationId, organizationId),
          eq(consumerIdentifiers.environmentId, batch.environmentId),
          eq(consumerIdentifiers.consumerHmacKeyVersionId, batch.consumerHmacKeyVersionId),
          eq(consumerIdentifiers.identifierHmac, session.consumer_hmac),
        ),
      )
      .limit(1);
    let consumerId = existingIdentifier?.consumerId;
    if (!consumerId) {
      const [createdConsumer] = await tx
        .insert(consumers)
        .values({
          organizationId,
          apiServiceId: batch.apiServiceId,
          environmentId: batch.environmentId,
          displayAlias: `Consumer ${session.consumer_hmac.slice(-10)}`,
          firstSeenAt: startedAt,
          lastSeenAt: endedAt,
          requestCount: 0n,
          lowVolume: true,
        })
        .returning({ id: consumers.id });
      if (!createdConsumer) throw new Error("Consumer creation returned no record");
      consumerId = createdConsumer.id;
      await tx.insert(consumerIdentifiers).values({
        organizationId,
        environmentId: batch.environmentId,
        consumerId,
        identitySource: "configured_header",
        identifierHmac: session.consumer_hmac,
        consumerHmacKeyVersionId: batch.consumerHmacKeyVersionId,
        isPrimary: true,
        firstSeenAt: startedAt,
        lastSeenAt: endedAt,
      });
    } else {
      await tx
        .update(consumerIdentifiers)
        .set({
          lastSeenAt: sql`greatest(${consumerIdentifiers.lastSeenAt}, ${endedAt.toISOString()}::timestamptz)`,
        })
        .where(
          and(
            eq(consumerIdentifiers.organizationId, organizationId),
            eq(consumerIdentifiers.environmentId, batch.environmentId),
            eq(consumerIdentifiers.consumerHmacKeyVersionId, batch.consumerHmacKeyVersionId),
            eq(consumerIdentifiers.identifierHmac, session.consumer_hmac),
          ),
        );
    }

    const expiresAt = new Date(endedAt.getTime() + batch.receiptTtlDays * 86_400_000);
    const receiptBundle = receiptBundles.get(session.session_hmac);
    if (!receiptBundle) throw new Error("Capture session is missing its bounded receipt bundle");
    const [createdReceiptObject] = await tx
      .insert(storedObjects)
      .values({
        organizationId,
        kind: "receipt_bundle",
        bucket: receiptBundle.bucket,
        objectKey: receiptBundle.objectKey,
        contentType: receiptBundle.contentType,
        contentEncoding: receiptBundle.contentEncoding,
        byteSize: BigInt(receiptBundle.byteSize),
        sha256Digest: receiptBundle.sha256Digest,
        scanStatus: "not_required",
        availabilityStatus: "available",
        expiresAt,
        verifiedAt: new Date(),
        createdByActorType: "system",
        createdByActorId: "process_ingestion_batch",
      })
      .onConflictDoNothing()
      .returning({ id: storedObjects.id, objectKey: storedObjects.objectKey });
    const receiptObject =
      createdReceiptObject ??
      (
        await tx
          .select({ id: storedObjects.id, objectKey: storedObjects.objectKey })
          .from(storedObjects)
          .where(
            and(
              eq(storedObjects.organizationId, organizationId),
              eq(storedObjects.kind, "receipt_bundle"),
              eq(storedObjects.sha256Digest, receiptBundle.sha256Digest),
              eq(storedObjects.availabilityStatus, "available"),
              isNull(storedObjects.deletedAt),
            ),
          )
          .limit(1)
      )[0];
    if (!receiptObject) throw new Error("Unable to register bounded receipt bundle");
    retainedReceiptObjectKeys.add(receiptObject.objectKey);
    const [captureSession] = await tx
      .insert(captureSessions)
      .values({
        organizationId,
        environmentId: batch.environmentId,
        agentId: batch.agentId,
        consumerId,
        ingestionBatchId: batch.id,
        sessionHmac: session.session_hmac,
        startedAt,
        endedAt,
        firstSequenceNo: BigInt(session.first_sequence),
        lastSequenceNo: BigInt(session.last_sequence),
        eventCount,
        completeness: completeness(session.completeness),
        correlationSource: session.correlation_source,
        samplingProbability: session.sampling_probability.toFixed(5),
        lowVolumeBoostApplied: session.low_volume_boosted,
        structuralHmacKeyVersionId: batch.structuralHmacKeyVersionId,
        receiptBundleObjectId: receiptObject.id,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: captureSessions.id });
    if (!captureSession) continue;
    processedSessions++;

    await tx
      .update(consumers)
      .set({
        firstSeenAt: sql`least(${consumers.firstSeenAt}, ${startedAt.toISOString()}::timestamptz)`,
        lastSeenAt: sql`greatest(${consumers.lastSeenAt}, ${endedAt.toISOString()}::timestamptz)`,
        requestCount: sql`${consumers.requestCount} + ${BigInt(eventCount)}`,
        lowVolume: sql`${consumers.requestCount} + ${BigInt(eventCount)} < ${BigInt(batch.lowVolumeThreshold)}`,
        updatedAt: new Date(),
      })
      .where(and(eq(consumers.organizationId, organizationId), eq(consumers.id, consumerId)));

    for (const fingerprint of session.extraction.fingerprints) {
      const operationId = operations.get(fingerprint.operation_key);
      if (!operationId)
        throw new Error(`Fingerprint references unknown operation ${fingerprint.operation_key}`);
      const [definition] = await tx
        .insert(behaviorDefinitions)
        .values({
          organizationId,
          apiServiceId: batch.apiServiceId,
          apiOperationId: operationId,
          kind: fingerprint.kind,
          fingerprintSchemaVersion: fingerprint.schema_version,
          extractorReleaseId: batch.extractorReleaseId,
          canonicalFingerprint: fingerprint.canonical,
          fingerprintDigest: fingerprint.digest,
          defaultLabel: fingerprint.default_label,
          firstSeenAt: startedAt,
          lastSeenAt: endedAt,
        })
        .onConflictDoUpdate({
          target: [
            behaviorDefinitions.apiOperationId,
            behaviorDefinitions.extractorReleaseId,
            behaviorDefinitions.fingerprintDigest,
          ],
          set: {
            lastSeenAt: sql`greatest(${behaviorDefinitions.lastSeenAt}, ${endedAt.toISOString()}::timestamptz)`,
          },
        })
        .returning({ id: behaviorDefinitions.id });
      if (!definition) throw new Error("Behavior definition upsert returned no record");
      behaviorDefinitionIds.add(definition.id);
      const count = BigInt(fingerprint.observation_count);
      const bucketStart = dayBucket(startedAt);
      const weight = fingerprint.observation_count / session.sampling_probability;
      await tx
        .insert(behaviorObservations)
        .values({
          organizationId,
          bucketStart,
          environmentId: batch.environmentId,
          apiOperationId: operationId,
          consumerId,
          behaviorDefinitionId: definition.id,
          observationCount: count,
          sessionCount: 1n,
          firstSeenAt: startedAt,
          lastSeenAt: endedAt,
          sampleWeight: weight.toFixed(5),
          supportMetrics: { samplingProbability: session.sampling_probability },
        })
        .onConflictDoUpdate({
          target: [
            behaviorObservations.bucketStart,
            behaviorObservations.environmentId,
            behaviorObservations.apiOperationId,
            behaviorObservations.consumerId,
            behaviorObservations.behaviorDefinitionId,
          ],
          set: {
            observationCount: sql`${behaviorObservations.observationCount} + ${count}`,
            sessionCount: sql`${behaviorObservations.sessionCount} + 1`,
            firstSeenAt: sql`least(${behaviorObservations.firstSeenAt}, ${startedAt.toISOString()}::timestamptz)`,
            lastSeenAt: sql`greatest(${behaviorObservations.lastSeenAt}, ${endedAt.toISOString()}::timestamptz)`,
            sampleWeight: sql`${behaviorObservations.sampleWeight} + ${weight.toString()}::numeric`,
          },
        });
      processedFingerprints++;
    }
  }

  await tx
    .update(ingestionBatches)
    .set({ status: "processed", processedAt: new Date(), failureCode: null })
    .where(eq(ingestionBatches.id, batch.id));
  return {
    processedSessions,
    processedFingerprints,
    behaviorDefinitionIds: [...behaviorDefinitionIds].sort(),
    retainedReceiptObjectKeys: [...retainedReceiptObjectKeys],
  };
}

export interface BehaviorForClassification {
  behaviorDefinitionId: string;
  apiSpecId: string;
  kind: "shape" | "ordering" | "error_template";
  canonicalFingerprint: unknown;
  normalizedContract: unknown;
}

export async function listBehaviorsForCurrentSpecClassification(
  tx: DatabaseTransaction,
  organizationId: string,
  apiServiceId: string,
): Promise<BehaviorForClassification[]> {
  return tx
    .select({
      behaviorDefinitionId: behaviorDefinitions.id,
      apiSpecId: apiSpecs.id,
      kind: behaviorDefinitions.kind,
      canonicalFingerprint: behaviorDefinitions.canonicalFingerprint,
      normalizedContract: apiSpecOperations.normalizedContract,
    })
    .from(behaviorDefinitions)
    .innerJoin(
      apiSpecOperations,
      and(
        eq(apiSpecOperations.organizationId, behaviorDefinitions.organizationId),
        eq(apiSpecOperations.apiOperationId, behaviorDefinitions.apiOperationId),
      ),
    )
    .innerJoin(
      apiSpecs,
      and(
        eq(apiSpecs.organizationId, apiSpecOperations.organizationId),
        eq(apiSpecs.id, apiSpecOperations.apiSpecId),
        eq(apiSpecs.apiServiceId, apiServiceId),
        eq(apiSpecs.isCurrent, true),
      ),
    )
    .where(
      and(
        eq(behaviorDefinitions.organizationId, organizationId),
        eq(behaviorDefinitions.apiServiceId, apiServiceId),
      ),
    );
}

export async function persistBehaviorSpecClassifications(
  tx: DatabaseTransaction,
  organizationId: string,
  classifications: ReadonlyArray<{
    behaviorDefinitionId: string;
    apiSpecId: string;
    status: "undeclared" | "declared" | "partially_declared" | "not_applicable";
    reasonCode: string;
    comparisonDetails: Record<string, unknown>;
    comparatorVersion: string;
  }>,
): Promise<number> {
  if (classifications.length === 0) return 0;
  const inserted = await tx
    .insert(behaviorSpecClassifications)
    .values(
      classifications.map((classification) => ({
        organizationId,
        ...classification,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: behaviorSpecClassifications.id });
  return inserted.length;
}

export async function getIngestionBatchServiceId(
  tx: DatabaseTransaction,
  organizationId: string,
  ingestionBatchId: string,
): Promise<string | null> {
  const [batch] = await tx
    .select({ apiServiceId: ingestionBatches.apiServiceId })
    .from(ingestionBatches)
    .where(
      and(
        eq(ingestionBatches.organizationId, organizationId),
        eq(ingestionBatches.id, ingestionBatchId),
      ),
    )
    .limit(1);
  return batch?.apiServiceId ?? null;
}
