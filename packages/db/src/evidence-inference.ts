import type { ProcessedCaptureSession } from "@hyrum/contracts";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  apiOperations,
  apiServices,
  apiSpecs,
  behaviorDefinitions,
  behaviorSpecClassifications,
  captureSessions,
  claimEvidence,
  dependencyClaims,
  ingestionBatches,
  ledgerEntries,
  receipts,
  storedObjects,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";

export type InferredReceiptType = "t1_echo" | "t2_pattern" | "exposure";

export interface ReceiptBundleArtifact {
  sessionHmac: string;
  receiptType: InferredReceiptType;
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  /** Digest of the bounded logical receipt, including its evidence type. */
  bundleDigest: string;
  contentType: string;
  contentEncoding: string | null;
}

interface EchoLocation {
  responseSequenceNo: bigint;
  requestSequenceNo: bigint;
  responseJsonPath: string;
  requestJsonPath: string;
  valueHmac: string;
}

interface ClaimCandidate {
  behaviorDefinitionId: string;
  defaultLabel: string;
  sessionHmac: string;
  tier: "t1" | "t2" | "t3";
  supportCount: number;
  echoes: EchoLocation[];
  confidence?: number;
  patternMetrics?: Record<string, unknown>;
}

function evidenceRank(tier: string): number {
  if (tier === "t1") return 2;
  if (tier === "t2") return 1;
  return 0;
}

export interface T2PatternSample {
  behaviorDefinitionId: string;
  retried: boolean;
}

export function evaluateT2RetryCovariation(
  groups: Iterable<readonly T2PatternSample[]>,
): Map<string, { supportCount: number; confidence: number; metrics: Record<string, unknown> }> {
  const patterns = new Map<
    string,
    { supportCount: number; confidence: number; metrics: Record<string, unknown> }
  >();
  for (const samples of groups) {
    if (samples.length < 20) continue;
    const byBehavior = new Map<string, { total: number; retries: number }>();
    for (const sample of samples) {
      const aggregate = byBehavior.get(sample.behaviorDefinitionId) ?? { total: 0, retries: 0 };
      aggregate.total += 1;
      if (sample.retried) aggregate.retries += 1;
      byBehavior.set(sample.behaviorDefinitionId, aggregate);
    }
    if (byBehavior.size < 2) continue;
    for (const [behaviorDefinitionId, exposed] of byBehavior) {
      const control = [...byBehavior.entries()]
        .filter(([id]) => id !== behaviorDefinitionId)
        .reduce(
          (result, [, value]) => ({
            total: result.total + value.total,
            retries: result.retries + value.retries,
          }),
          { total: 0, retries: 0 },
        );
      if (exposed.total < 5 || control.total < 5) continue;
      const exposedRate = exposed.retries / exposed.total;
      const controlRate = control.retries / control.total;
      const difference = Math.abs(exposedRate - controlRate);
      const pooledRate = (exposed.retries + control.retries) / (exposed.total + control.total);
      const standardError = Math.sqrt(
        pooledRate * (1 - pooledRate) * (1 / exposed.total + 1 / control.total),
      );
      const zScore = standardError === 0 ? 0 : difference / standardError;
      if (difference < 0.3 || zScore < 1.96) continue;
      const confidence = Math.min(0.9999, 1 - Math.exp(-(zScore * zScore) / 2));
      patterns.set(behaviorDefinitionId, {
        supportCount: exposed.total,
        confidence,
        metrics: {
          rule: "same_status_error_template_retry_covariation",
          exposedSessions: exposed.total,
          exposedRetries: exposed.retries,
          exposedRetryRate: exposedRate,
          controlSessions: control.total,
          controlRetries: control.retries,
          controlRetryRate: controlRate,
          absoluteRateDifference: difference,
          zScore,
          statusControlled: true,
          minimumSupport: 5,
        },
      });
    }
  }
  return patterns;
}

/**
 * Persists bounded redacted receipts and derives machine-checkable T1/T2/T3 facts.
 * T2 requires same-consumer, same-operation, same-status natural template variation,
 * minimum support, a material retry-rate difference, and a two-proportion significance
 * threshold. It remains suggestive and is structurally unable to block.
 * Claims are append-only versions: new evidence supersedes, rather than mutates, the
 * active conclusion while preserving human workflow state in the new ledger entry.
 */
export async function inferDeterministicClaims(
  tx: DatabaseTransaction,
  organizationId: string,
  ingestionBatchId: string,
  sessions: readonly ProcessedCaptureSession[],
  artifacts: readonly ReceiptBundleArtifact[],
): Promise<{ receipts: number; claims: number; evidence: number }> {
  const [batch] = await tx
    .select({
      apiServiceId: ingestionBatches.apiServiceId,
      environmentId: ingestionBatches.environmentId,
      redactionPolicyVersionId: ingestionBatches.redactionPolicyVersionId,
      extractorReleaseId: ingestionBatches.extractorReleaseId,
    })
    .from(ingestionBatches)
    .where(
      and(
        eq(ingestionBatches.organizationId, organizationId),
        eq(ingestionBatches.id, ingestionBatchId),
        eq(ingestionBatches.status, "processed"),
      ),
    )
    .limit(1);
  if (!batch) throw new Error("Processed ingestion batch not found for evidence inference");

  const captured = await tx
    .select({
      id: captureSessions.id,
      sessionHmac: captureSessions.sessionHmac,
      consumerId: captureSessions.consumerId,
      startedAt: captureSessions.startedAt,
      endedAt: captureSessions.endedAt,
      firstSequenceNo: captureSessions.firstSequenceNo,
      lastSequenceNo: captureSessions.lastSequenceNo,
      completeness: captureSessions.completeness,
      structuralHmacKeyVersionId: captureSessions.structuralHmacKeyVersionId,
      expiresAt: captureSessions.expiresAt,
    })
    .from(captureSessions)
    .where(
      and(
        eq(captureSessions.organizationId, organizationId),
        eq(captureSessions.ingestionBatchId, ingestionBatchId),
      ),
    );
  const capturedByHmac = new Map(captured.map((session) => [session.sessionHmac, session]));

  const persistedReceipts = new Map<string, string>();
  let receiptCount = 0;
  for (const artifact of artifacts) {
    const capturedSession = capturedByHmac.get(artifact.sessionHmac);
    if (!capturedSession) continue;
    const [createdObject] = await tx
      .insert(storedObjects)
      .values({
        organizationId,
        kind: "receipt_bundle",
        bucket: artifact.bucket,
        objectKey: artifact.objectKey,
        contentType: artifact.contentType,
        contentEncoding: artifact.contentEncoding,
        byteSize: BigInt(artifact.byteSize),
        sha256Digest: artifact.sha256Digest,
        scanStatus: "not_required",
        scannedAt: new Date(),
        availabilityStatus: "available",
        verifiedAt: new Date(),
        expiresAt: capturedSession.expiresAt,
        createdByActorType: "system",
        createdByActorId: "worker:process_ingestion_batch",
      })
      .onConflictDoNothing()
      .returning({ id: storedObjects.id });
    const storedObject =
      createdObject ??
      (
        await tx
          .select({ id: storedObjects.id })
          .from(storedObjects)
          .where(
            and(
              eq(storedObjects.organizationId, organizationId),
              eq(storedObjects.kind, "receipt_bundle"),
              eq(storedObjects.sha256Digest, artifact.sha256Digest),
              eq(storedObjects.availabilityStatus, "available"),
              isNull(storedObjects.deletedAt),
            ),
          )
          .limit(1)
      )[0];
    if (!storedObject) throw new Error("Receipt bundle metadata could not be persisted");

    const [createdReceipt] = await tx
      .insert(receipts)
      .values({
        organizationId,
        apiServiceId: batch.apiServiceId,
        environmentId: batch.environmentId,
        consumerId: capturedSession.consumerId,
        captureSessionId: capturedSession.id,
        storedObjectId: storedObject.id,
        receiptType: artifact.receiptType,
        bundleDigest: artifact.bundleDigest,
        redactionPolicyVersionId: batch.redactionPolicyVersionId,
        extractorReleaseId: batch.extractorReleaseId,
        sequenceStart: capturedSession.firstSequenceNo,
        sequenceEnd: capturedSession.lastSequenceNo,
        completeness: capturedSession.completeness,
        availabilityStatus: "available",
        expiresAt: capturedSession.expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: receipts.id });
    const receipt =
      createdReceipt ??
      (
        await tx
          .select({ id: receipts.id })
          .from(receipts)
          .where(
            and(
              eq(receipts.organizationId, organizationId),
              eq(receipts.bundleDigest, artifact.bundleDigest),
            ),
          )
          .limit(1)
      )[0];
    if (!receipt) throw new Error("Receipt metadata could not be persisted");
    persistedReceipts.set(`${artifact.sessionHmac}:${artifact.receiptType}`, receipt.id);
    if (createdReceipt) receiptCount++;
  }

  const behaviorRows = await tx
    .select({
      id: behaviorDefinitions.id,
      operationKey: apiOperations.operationKey,
      fingerprintDigest: behaviorDefinitions.fingerprintDigest,
      defaultLabel: behaviorDefinitions.defaultLabel,
      classifiedAt: behaviorSpecClassifications.createdAt,
    })
    .from(behaviorDefinitions)
    .innerJoin(
      apiOperations,
      and(
        eq(apiOperations.organizationId, behaviorDefinitions.organizationId),
        eq(apiOperations.id, behaviorDefinitions.apiOperationId),
      ),
    )
    .innerJoin(
      behaviorSpecClassifications,
      and(
        eq(behaviorSpecClassifications.organizationId, behaviorDefinitions.organizationId),
        eq(behaviorSpecClassifications.behaviorDefinitionId, behaviorDefinitions.id),
      ),
    )
    .innerJoin(
      apiSpecs,
      and(
        eq(apiSpecs.organizationId, behaviorSpecClassifications.organizationId),
        eq(apiSpecs.id, behaviorSpecClassifications.apiSpecId),
        eq(apiSpecs.apiServiceId, batch.apiServiceId),
        eq(apiSpecs.isCurrent, true),
      ),
    )
    .where(
      and(
        eq(behaviorDefinitions.organizationId, organizationId),
        eq(behaviorDefinitions.apiServiceId, batch.apiServiceId),
        inArray(behaviorSpecClassifications.status, ["undeclared", "partially_declared"]),
      ),
    )
    .orderBy(desc(behaviorSpecClassifications.createdAt));
  const behaviorByFingerprint = new Map<string, (typeof behaviorRows)[number]>();
  for (const behavior of behaviorRows) {
    const key = `${behavior.operationKey}:${behavior.fingerprintDigest}`;
    if (!behaviorByFingerprint.has(key)) behaviorByFingerprint.set(key, behavior);
  }

  const candidates = new Map<string, ClaimCandidate>();
  const patternSamples = new Map<
    string,
    Array<{ behaviorDefinitionId: string; retried: boolean }>
  >();
  for (const session of sessions) {
    for (const fingerprint of session.extraction.fingerprints) {
      const behavior = behaviorByFingerprint.get(
        `${fingerprint.operation_key}:${fingerprint.digest}`,
      );
      if (!behavior) continue;
      candidates.set(`${session.session_hmac}:${behavior.id}`, {
        behaviorDefinitionId: behavior.id,
        defaultLabel: behavior.defaultLabel,
        sessionHmac: session.session_hmac,
        tier: "t3",
        supportCount: fingerprint.observation_count,
        echoes: [],
      });
      if (fingerprint.kind === "error_template" && session.completeness === "complete") {
        const status = fingerprint.canonical.status;
        if (typeof status === "number") {
          const source = session.exchanges.find(
            (exchange) =>
              exchange.operation_key === fingerprint.operation_key &&
              exchange.response_status === status,
          );
          if (source) {
            const retried = session.exchanges.some(
              (exchange) =>
                exchange.sequence > source.sequence &&
                exchange.operation_key === source.operation_key &&
                exchange.request_method === source.request_method &&
                exchange.request_path === source.request_path,
            );
            const patternKey = `${capturedByHmac.get(session.session_hmac)?.consumerId ?? ""}:${fingerprint.operation_key}:${status}`;
            patternSamples.set(patternKey, [
              ...(patternSamples.get(patternKey) ?? []),
              { behaviorDefinitionId: behavior.id, retried },
            ]);
          }
        }
      }
    }
    if (session.completeness !== "complete") continue;
    for (const echo of session.extraction.echoes ?? []) {
      const behavior = behaviorByFingerprint.get(
        `${echo.source_operation_key}:${echo.source_shape_digest}`,
      );
      if (!behavior) continue;
      const key = `${session.session_hmac}:${behavior.id}`;
      const existing = candidates.get(key);
      const location = {
        responseSequenceNo: BigInt(echo.source_sequence),
        requestSequenceNo: BigInt(echo.destination_sequence),
        responseJsonPath: echo.source_path,
        requestJsonPath: echo.destination_path,
        valueHmac: echo.value_token,
      };
      candidates.set(key, {
        behaviorDefinitionId: behavior.id,
        defaultLabel: behavior.defaultLabel,
        sessionHmac: session.session_hmac,
        tier: "t1",
        supportCount: (existing?.tier === "t1" ? existing.supportCount : 0) + 1,
        echoes: [...(existing?.tier === "t1" ? existing.echoes : []), location],
      });
    }
  }

  const t2Patterns = evaluateT2RetryCovariation(patternSamples.values());
  for (const candidate of candidates.values()) {
    if (candidate.tier === "t1") continue;
    const pattern = t2Patterns.get(candidate.behaviorDefinitionId);
    if (!pattern) continue;
    candidate.tier = "t2";
    candidate.supportCount = pattern.supportCount;
    candidate.confidence = pattern.confidence;
    candidate.patternMetrics = pattern.metrics;
  }

  const aggregatedCandidates = new Map<string, ClaimCandidate>();
  for (const candidate of candidates.values()) {
    const capturedSession = capturedByHmac.get(candidate.sessionHmac);
    if (!capturedSession) continue;
    const key = `${capturedSession.consumerId}:${candidate.behaviorDefinitionId}`;
    const existing = aggregatedCandidates.get(key);
    if (!existing || evidenceRank(candidate.tier) > evidenceRank(existing.tier)) {
      aggregatedCandidates.set(key, candidate);
      continue;
    }
    if (evidenceRank(candidate.tier) < evidenceRank(existing.tier)) continue;
    if (candidate.tier === "t1") {
      existing.supportCount += candidate.supportCount;
      existing.echoes.push(...candidate.echoes);
    } else if (candidate.tier === "t2") {
      existing.supportCount = Math.max(existing.supportCount, candidate.supportCount);
      const confidence = candidate.confidence;
      const patternMetrics = candidate.patternMetrics;
      if ((confidence ?? 0) > (existing.confidence ?? 0)) {
        if (confidence !== undefined) existing.confidence = confidence;
        if (patternMetrics !== undefined) {
          existing.patternMetrics = patternMetrics;
        }
        existing.sessionHmac = candidate.sessionHmac;
      }
    } else {
      existing.supportCount += candidate.supportCount;
    }
  }

  let claimCount = 0;
  let evidenceCount = 0;
  for (const candidate of aggregatedCandidates.values()) {
    const capturedSession = capturedByHmac.get(candidate.sessionHmac);
    if (!capturedSession) continue;
    const receiptType =
      candidate.tier === "t1" ? "t1_echo" : candidate.tier === "t2" ? "t2_pattern" : "exposure";
    const receiptId = persistedReceipts.get(`${candidate.sessionHmac}:${receiptType}`);
    if (!receiptId) throw new Error(`Missing ${receiptType} receipt for inferred claim`);

    const [active] = await tx
      .select({
        id: dependencyClaims.id,
        tier: dependencyClaims.tier,
        supportCount: dependencyClaims.supportCount,
        ownerMembershipId: ledgerEntries.ownerMembershipId,
        reviewState: ledgerEntries.reviewState,
        firstDetectedAt: ledgerEntries.firstDetectedAt,
      })
      .from(dependencyClaims)
      .leftJoin(
        ledgerEntries,
        and(
          eq(ledgerEntries.organizationId, dependencyClaims.organizationId),
          eq(ledgerEntries.dependencyClaimId, dependencyClaims.id),
        ),
      )
      .where(
        and(
          eq(dependencyClaims.organizationId, organizationId),
          eq(dependencyClaims.consumerId, capturedSession.consumerId),
          eq(dependencyClaims.behaviorDefinitionId, candidate.behaviorDefinitionId),
          eq(dependencyClaims.status, "active"),
          isNull(dependencyClaims.effectiveUntil),
        ),
      )
      .limit(1);
    if (active && evidenceRank(active.tier) > evidenceRank(candidate.tier)) continue;

    const inferredAt = new Date();
    if (active) {
      await tx
        .update(dependencyClaims)
        .set({ status: "superseded", effectiveUntil: inferredAt })
        .where(
          and(
            eq(dependencyClaims.organizationId, organizationId),
            eq(dependencyClaims.id, active.id),
            eq(dependencyClaims.status, "active"),
          ),
        );
    }
    const [claim] = await tx
      .insert(dependencyClaims)
      .values({
        organizationId,
        apiServiceId: batch.apiServiceId,
        environmentId: batch.environmentId,
        consumerId: capturedSession.consumerId,
        behaviorDefinitionId: candidate.behaviorDefinitionId,
        tier: candidate.tier,
        status: "proposed",
        ruleVersion:
          candidate.tier === "t1"
            ? "echo-v1"
            : candidate.tier === "t2"
              ? "same-status-retry-covariation-v1"
              : "exposure-v1",
        deterministicEligible: candidate.tier === "t1",
        supportCount: (active?.supportCount ?? 0n) + BigInt(candidate.supportCount),
        effectiveFrom: inferredAt,
        supersedesClaimId: active?.id,
        proposedBy: "rules",
        confidence: candidate.tier === "t2" ? candidate.confidence?.toFixed(4) : null,
      })
      .returning({ id: dependencyClaims.id });
    if (!claim) throw new Error("Dependency claim creation returned no record");

    const evidenceRows =
      candidate.tier === "t1"
        ? candidate.echoes.map((echo) => ({
            organizationId,
            dependencyClaimId: claim.id,
            receiptId,
            evidenceRole: "primary" as const,
            ...echo,
            structuralHmacKeyVersionId: capturedSession.structuralHmacKeyVersionId,
            patternMetrics: null,
          }))
        : [
            {
              organizationId,
              dependencyClaimId: claim.id,
              receiptId,
              evidenceRole: "primary" as const,
              responseSequenceNo: null,
              requestSequenceNo: null,
              responseJsonPath: null,
              requestJsonPath: null,
              valueHmac: null,
              structuralHmacKeyVersionId: null,
              patternMetrics:
                candidate.tier === "t2"
                  ? candidate.patternMetrics
                  : {
                      observationCount: candidate.supportCount,
                      inference: "exposure_only",
                    },
            },
          ];
    const insertedEvidence = await tx
      .insert(claimEvidence)
      .values(evidenceRows)
      .onConflictDoNothing()
      .returning({ id: claimEvidence.id });
    if (candidate.tier === "t1" && insertedEvidence.length === 0) {
      throw new Error("T1 claim cannot activate without primary echo evidence");
    }
    evidenceCount += insertedEvidence.length;

    await tx
      .update(dependencyClaims)
      .set({ status: "active" })
      .where(
        and(
          eq(dependencyClaims.organizationId, organizationId),
          eq(dependencyClaims.id, claim.id),
          eq(dependencyClaims.status, "proposed"),
        ),
      );
    await tx.insert(ledgerEntries).values({
      organizationId,
      dependencyClaimId: claim.id,
      ownerMembershipId: active?.ownerMembershipId,
      reviewState: active?.reviewState ?? "unreviewed",
      firstDetectedAt: active?.firstDetectedAt ?? capturedSession.startedAt,
      lastObservedAt: capturedSession.endedAt,
      searchDocument: sql`to_tsvector('simple', ${candidate.defaultLabel})`,
    });
    claimCount++;

    if (candidate.tier === "t1") {
      await tx
        .update(apiServices)
        .set({ firstUsefulLedgerAt: sql`coalesce(${apiServices.firstUsefulLedgerAt}, now())` })
        .where(
          and(
            eq(apiServices.organizationId, organizationId),
            eq(apiServices.id, batch.apiServiceId),
          ),
        );
    }
  }
  return { receipts: receiptCount, claims: claimCount, evidence: evidenceCount };
}
