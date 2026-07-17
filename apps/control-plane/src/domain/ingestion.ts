import type {
  AgentCaptureEvent,
  BehaviorFingerprint,
  BehaviorKind,
  CaptureBatchResponse,
  CaptureEvidence,
  EvidenceTier,
} from "@hyrum/contracts";
import { progressEventTopic } from "@hyrum/contracts";
import {
  and,
  apiSpecs,
  behaviorDefinitions,
  behaviorObservations,
  captureSessions,
  consumers,
  type Database,
  dependencyClaims,
  enqueueOutboxEvent,
  eq,
  jobs,
  ledgerEntries,
  operations,
  receipts,
  sql,
  type TenantDb,
  withTenant,
} from "@hyrum/db";
import type { S3ObjectStorage } from "@hyrum/storage";
import { ledgerFreshnessUntil, scheduleLedgerFreshness } from "./ledger-freshness";
import { isBehaviorDeclared, type NormalizedOpenApiSpec } from "./openapi";
import { sha256Hex, stableStringify } from "./security";

export interface BehaviorCandidate {
  kind: BehaviorKind;
  path: string;
  tier: EvidenceTier;
  evidence: CaptureEvidence[];
  fingerprint: unknown;
  sequenceStart?: number;
  sequenceEnd?: number;
}

type ReceiptStorage = Pick<S3ObjectStorage, "putObject">;

const tierRank: Record<EvidenceTier, number> = { T1: 3, T2: 2, T3: 1 };

function normalizeShapePath(path: string) {
  return path.startsWith("$") ? path : `$.${path}`;
}

function shapeFingerprint(fingerprint: BehaviorFingerprint, path: string) {
  return fingerprint.shape.find((field) => normalizeShapePath(field.path) === path) ?? { path };
}

function orderingFingerprint(fingerprint: BehaviorFingerprint, path: string) {
  return fingerprint.ordering?.find((entry) => normalizeShapePath(entry.path) === path) ?? { path };
}

function t3Fingerprint(event: AgentCaptureEvent, kind: BehaviorKind, path: string) {
  if (kind === "shape") return shapeFingerprint(event.fingerprint, normalizeShapePath(path));
  if (kind === "ordering") return orderingFingerprint(event.fingerprint, normalizeShapePath(path));
  if (kind === "error") return event.fingerprint.error ?? { path };
  return { status: event.fingerprint.status };
}

function strongest(left: BehaviorCandidate, right: BehaviorCandidate) {
  if (tierRank[right.tier] > tierRank[left.tier]) {
    return { ...right, evidence: [...left.evidence, ...right.evidence] };
  }
  return { ...left, evidence: [...left.evidence, ...right.evidence] };
}

export function deriveBehaviorCandidates(event: AgentCaptureEvent): BehaviorCandidate[] {
  const candidates = new Map<string, BehaviorCandidate>();
  const add = (candidate: BehaviorCandidate) => {
    const key = `${candidate.kind}:${candidate.path}`;
    const existing = candidates.get(key);
    candidates.set(key, existing ? strongest(existing, candidate) : candidate);
  };

  for (const evidence of event.evidence) {
    if (evidence.tier === "T1") {
      for (const rawPath of evidence.echo.response_paths) {
        const path = normalizeShapePath(rawPath);
        add({
          kind: "shape",
          path,
          tier: "T1",
          evidence: [evidence],
          fingerprint: shapeFingerprint(event.fingerprint, path),
          sequenceStart: evidence.echo.response_sequence,
          sequenceEnd: evidence.echo.request_sequence,
        });
      }
      continue;
    }
    if (evidence.tier === "T2") {
      add({
        kind: "error",
        path: "$error",
        tier: "T2",
        evidence: [evidence],
        fingerprint: event.fingerprint.error ?? {
          status: evidence.pattern.status,
          template: evidence.pattern.error_template,
        },
      });
      continue;
    }
    const kind = evidence.exposure.behavior_kind;
    const path =
      kind === "shape" || kind === "ordering"
        ? normalizeShapePath(evidence.exposure.behavior_path)
        : evidence.exposure.behavior_path;
    add({
      kind,
      path,
      tier: "T3",
      evidence: [evidence],
      fingerprint: t3Fingerprint(event, kind, path),
    });
  }
  return [...candidates.values()];
}

function aliasFor(stableId: string) {
  return `consumer_${stableId.slice(0, 8)}`;
}

function behaviorDigest(event: AgentCaptureEvent, candidate: BehaviorCandidate) {
  return sha256Hex({
    extractor_version: event.fingerprint.version,
    kind: candidate.kind,
    path: candidate.path,
    fingerprint: candidate.fingerprint,
  });
}

function claimConfidence(tier: EvidenceTier) {
  if (tier === "T1") return 100;
  if (tier === "T2") return 50;
  return 0;
}

export async function storeReceiptBundle(input: {
  objectStorage: ReceiptStorage;
  organizationId: string;
  excerpt: unknown;
  onError?: (error: unknown) => void;
}) {
  const sha256 = sha256Hex(input.excerpt);
  try {
    return await input.objectStorage.putObject({
      organizationId: input.organizationId,
      kind: "receipt",
      body: stableStringify(input.excerpt),
      contentType: "application/json",
      expectedSha256: sha256,
    });
  } catch (error) {
    input.onError?.(error);
    return undefined;
  }
}

export function ledgerTitle(candidate: BehaviorCandidate) {
  if (candidate.tier === "T1") return `Dependency: ${candidate.kind} ${candidate.path}`;
  if (candidate.tier === "T2") return `Pattern evidence: ${candidate.kind} ${candidate.path}`;
  return `Exposure: ${candidate.kind} ${candidate.path}`;
}

export function undeclaredBehaviorCandidates(
  event: AgentCaptureEvent,
  normalized: NormalizedOpenApiSpec | undefined,
) {
  const candidates = deriveBehaviorCandidates(event);
  const pathTemplate = event.request.path_template;
  return candidates.filter(
    (candidate) =>
      !normalized ||
      !pathTemplate ||
      !isBehaviorDeclared(normalized, event.request.method, pathTemplate, {
        ...candidate,
        responseStatus: event.response.status,
      }),
  );
}

export async function ingestCaptureEvent(
  db: Database,
  organizationId: string,
  event: AgentCaptureEvent,
  retentionDays = 30,
  storage?: {
    objectStorage: ReceiptStorage;
    onError?: (error: unknown) => void;
  },
) {
  return withTenant(db, organizationId, async (tx) => {
    const occurredAt = new Date(event.occurred_at);
    const expiresAt = new Date(occurredAt.getTime() + retentionDays * 86_400_000);
    const freshnessUntil = ledgerFreshnessUntil(occurredAt);
    const operationPath = event.request.path_template ?? event.request.path;

    const [consumer] = await tx
      .insert(consumers)
      .values({
        organizationId,
        stableId: event.consumer_id,
        displayAlias: aliasFor(event.consumer_id),
        lastSeenAt: occurredAt,
      })
      .onConflictDoUpdate({
        target: [consumers.organizationId, consumers.stableId],
        set: { lastSeenAt: occurredAt },
      })
      .returning({ id: consumers.id });

    const [operation] = await tx
      .insert(operations)
      .values({
        organizationId,
        method: event.request.method.toUpperCase(),
        pathTemplate: operationPath,
      })
      .onConflictDoUpdate({
        target: [operations.organizationId, operations.method, operations.pathTemplate],
        set: { updatedAt: new Date() },
      })
      .returning({ id: operations.id });

    if (!consumer || !operation) throw new Error("Failed to upsert capture dimensions");

    const [session] = await tx
      .insert(captureSessions)
      .values({
        organizationId,
        consumerId: consumer.id,
        sessionId: event.session_id,
        startedAt: occurredAt,
        endedAt: occurredAt,
        sessionComplete: event.session_complete,
      })
      .onConflictDoUpdate({
        target: [
          captureSessions.organizationId,
          captureSessions.consumerId,
          captureSessions.sessionId,
        ],
        set: {
          endedAt: occurredAt,
          sessionComplete: sql`${captureSessions.sessionComplete} OR ${event.session_complete}`,
        },
      })
      .returning({ id: captureSessions.id });

    const [activeSpec] = await tx
      .select({ normalized: apiSpecs.normalized })
      .from(apiSpecs)
      .where(and(eq(apiSpecs.organizationId, organizationId), eq(apiSpecs.active, true)))
      .limit(1);
    if (!session) throw new Error("Failed to upsert capture session");

    const [existingObservation] = await tx
      .select({ id: behaviorObservations.id })
      .from(behaviorObservations)
      .where(
        and(
          eq(behaviorObservations.organizationId, organizationId),
          eq(behaviorObservations.eventId, event.event_id),
        ),
      )
      .limit(1);
    if (existingObservation) return "duplicate" as const;

    const candidates = deriveBehaviorCandidates(event);
    const undeclaredCandidates = undeclaredBehaviorCandidates(
      event,
      activeSpec ? (activeSpec.normalized as NormalizedOpenApiSpec) : undefined,
    );
    if (candidates.length > 0 && undeclaredCandidates.length === 0) {
      return "ignored_declared" as const;
    }

    let ledgerUpdated = false;
    for (const candidate of undeclaredCandidates) {
      const candidateDigest = behaviorDigest(event, candidate);
      const [behavior] = await tx
        .insert(behaviorDefinitions)
        .values({
          organizationId,
          fingerprintDigest: candidateDigest,
          kind: candidate.kind,
          extractorVersion: event.fingerprint.version,
          fingerprint: {
            path: candidate.path,
            value: candidate.fingerprint,
          },
          declared: false,
        })
        .onConflictDoUpdate({
          target: [behaviorDefinitions.organizationId, behaviorDefinitions.fingerprintDigest],
          set: { updatedAt: new Date() },
        })
        .returning({ id: behaviorDefinitions.id });

      if (!behavior) throw new Error("Failed to upsert capture behavior");

      const [observation] = await tx
        .insert(behaviorObservations)
        .values({
          organizationId,
          operationId: operation.id,
          consumerId: consumer.id,
          behaviorId: behavior.id,
          captureSessionId: session.id,
          eventId: event.event_id,
          firstSeenAt: occurredAt,
          lastSeenAt: occurredAt,
        })
        .onConflictDoNothing({
          target: [
            behaviorObservations.organizationId,
            behaviorObservations.eventId,
            behaviorObservations.behaviorId,
          ],
        })
        .returning({ id: behaviorObservations.id });

      if (!observation) continue;

      const excerpt = {
        event_id: event.event_id,
        kind: candidate.kind,
        path: candidate.path,
        request: { method: event.request.method, path: event.request.path },
        response: {
          status: event.response.status,
          ...(event.response.body !== undefined ? { body: event.response.body } : {}),
        },
        evidence: candidate.evidence,
      };
      const receiptDigest = sha256Hex(excerpt);
      const storedReceipt = storage
        ? await storeReceiptBundle({
            objectStorage: storage.objectStorage,
            organizationId,
            excerpt,
            ...(storage.onError ? { onError: storage.onError } : {}),
          })
        : undefined;

      const [receipt] = await tx
        .insert(receipts)
        .values({
          organizationId,
          behaviorId: behavior.id,
          consumerId: consumer.id,
          operationId: operation.id,
          captureSessionId: session.id,
          objectKey: storedReceipt?.key,
          digest: `sha256:${receiptDigest}`,
          redactionVersion: event.redaction_version,
          sequenceStart: candidate.sequenceStart ?? event.sequence,
          sequenceEnd: candidate.sequenceEnd ?? event.sequence,
          excerpt,
          expiresAt,
        })
        .returning({ id: receipts.id });

      if (!receipt) throw new Error("Failed to store receipt");
      await tx
        .insert(jobs)
        .values({
          organizationId,
          type: "receipts.cleanup",
          payload: {},
          runAfter: expiresAt,
          idempotencyKey: `receipts.cleanup:${expiresAt.toISOString().slice(0, 10)}`,
        })
        .onConflictDoUpdate({
          target: [jobs.organizationId, jobs.idempotencyKey],
          set: {
            runAfter: sql`least(${jobs.runAfter}, ${expiresAt.toISOString()}::timestamptz)`,
          },
        });

      const [insertedClaim] = await tx
        .insert(dependencyClaims)
        .values({
          organizationId,
          behaviorId: behavior.id,
          consumerId: consumer.id,
          tier: candidate.tier,
          confidence: claimConfidence(candidate.tier),
          evidence: { tier: candidate.tier, items: candidate.evidence },
          receiptId: receipt.id,
        })
        .onConflictDoNothing({
          target: [
            dependencyClaims.organizationId,
            dependencyClaims.behaviorId,
            dependencyClaims.consumerId,
          ],
        })
        .returning({ id: dependencyClaims.id, tier: dependencyClaims.tier });

      let claim = insertedClaim;
      if (!claim) {
        const [existingClaim] = await tx
          .select({ id: dependencyClaims.id, tier: dependencyClaims.tier })
          .from(dependencyClaims)
          .where(
            and(
              eq(dependencyClaims.organizationId, organizationId),
              eq(dependencyClaims.behaviorId, behavior.id),
              eq(dependencyClaims.consumerId, consumer.id),
            ),
          )
          .limit(1);
        if (!existingClaim) throw new Error("Failed to load dependency claim");
        claim = existingClaim;
        if (tierRank[candidate.tier] > tierRank[claim.tier]) {
          const [promotedClaim] = await tx
            .update(dependencyClaims)
            .set({
              tier: candidate.tier,
              state: "active",
              confidence: claimConfidence(candidate.tier),
              evidence: { tier: candidate.tier, items: candidate.evidence },
              receiptId: receipt.id,
            })
            .where(eq(dependencyClaims.id, claim.id))
            .returning({ id: dependencyClaims.id, tier: dependencyClaims.tier });
          if (promotedClaim) claim = promotedClaim;
        } else {
          await tx
            .update(dependencyClaims)
            .set({ state: "active", receiptId: receipt.id, updatedAt: new Date() })
            .where(eq(dependencyClaims.id, claim.id));
        }
      }

      await tx
        .insert(ledgerEntries)
        .values({
          organizationId,
          claimId: claim.id,
          behaviorId: behavior.id,
          consumerId: consumer.id,
          operationId: operation.id,
          tier: claim.tier,
          title: ledgerTitle({ ...candidate, tier: claim.tier }),
          lastSeenAt: occurredAt,
          freshnessUntil,
          receiptId: receipt.id,
        })
        .onConflictDoUpdate({
          target: [ledgerEntries.organizationId, ledgerEntries.claimId],
          set: {
            tier: claim.tier,
            state: "active",
            title: ledgerTitle({ ...candidate, tier: claim.tier }),
            lastSeenAt: sql`greatest(${ledgerEntries.lastSeenAt}, ${occurredAt.toISOString()}::timestamptz)`,
            freshnessUntil: sql`greatest(${ledgerEntries.freshnessUntil}, ${freshnessUntil.toISOString()}::timestamptz)`,
            receiptId: receipt.id,
          },
        });
      ledgerUpdated = true;
    }

    if (ledgerUpdated) await scheduleLedgerFreshness(tx, organizationId, freshnessUntil);
    return "accepted" as const;
  });
}

export async function enqueueCaptureFollowup(
  tx: TenantDb,
  organizationId: string,
  batchId: string,
  idempotencyScope: string,
  response: CaptureBatchResponse,
) {
  await enqueueOutboxEvent(tx, {
    organizationId,
    topic: progressEventTopic.captureBatchIngested,
    idempotencyKey: `capture.batch_ingested:${idempotencyScope}`,
    payload: { resource_id: batchId, payload: response },
  });
  if (response.accepted_count > 0) {
    await enqueueOutboxEvent(tx, {
      organizationId,
      topic: progressEventTopic.ledgerUpdated,
      idempotencyKey: `ledger.updated:${idempotencyScope}`,
      payload: { resource_id: batchId, payload: response },
    });
  }
}

export function ensureEventTenant(organizationId: string, event: AgentCaptureEvent) {
  return event.organization_id === organizationId;
}
