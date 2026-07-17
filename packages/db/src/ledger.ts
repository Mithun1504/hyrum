import { createHash } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  auditEvents,
  behaviorDefinitions,
  claimEvidence,
  claimReviewDecisions,
  consumers,
  dependencyClaims,
  ledgerEntries,
  outboxEvents,
  receipts,
  storedObjects,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface LedgerCursor {
  lastObservedAt: Date;
  id: string;
}

export interface LedgerFilters {
  tier?: "t1" | "t2" | "t3";
  search?: string;
  cursor?: LedgerCursor;
  limit?: number;
}

export async function listLedger(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  filters: LedgerFilters = {},
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    const conditions = [
      eq(dependencyClaims.organizationId, organizationId),
      eq(dependencyClaims.apiServiceId, apiServiceId),
      eq(dependencyClaims.status, "active"),
    ];
    if (filters.tier) conditions.push(eq(dependencyClaims.tier, filters.tier));
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      const searchCondition = or(
        ilike(consumers.displayAlias, pattern),
        ilike(behaviorDefinitions.defaultLabel, pattern),
        ilike(apiOperations.normalizedPathTemplate, pattern),
      );
      if (searchCondition) conditions.push(searchCondition);
    }
    if (filters.cursor) {
      const cursorCondition = or(
        lt(ledgerEntries.lastObservedAt, filters.cursor.lastObservedAt),
        and(
          eq(ledgerEntries.lastObservedAt, filters.cursor.lastObservedAt),
          lt(ledgerEntries.id, filters.cursor.id),
        ),
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }
    const rows = await tx
      .select({
        id: ledgerEntries.id,
        dependencyClaimId: dependencyClaims.id,
        consumerId: consumers.id,
        consumerAlias: consumers.displayAlias,
        method: apiOperations.httpMethod,
        path: apiOperations.normalizedPathTemplate,
        operationName: apiOperations.displayName,
        behaviorId: behaviorDefinitions.id,
        behaviorKind: behaviorDefinitions.kind,
        behaviorLabel: behaviorDefinitions.defaultLabel,
        tier: dependencyClaims.tier,
        claimStatus: dependencyClaims.status,
        deterministicEligible: dependencyClaims.deterministicEligible,
        supportCount: dependencyClaims.supportCount,
        reviewState: ledgerEntries.reviewState,
        freshnessStatus: ledgerEntries.freshnessStatus,
        firstDetectedAt: ledgerEntries.firstDetectedAt,
        lastObservedAt: ledgerEntries.lastObservedAt,
        updatedAt: ledgerEntries.updatedAt,
      })
      .from(ledgerEntries)
      .innerJoin(
        dependencyClaims,
        and(
          eq(dependencyClaims.organizationId, ledgerEntries.organizationId),
          eq(dependencyClaims.id, ledgerEntries.dependencyClaimId),
        ),
      )
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
      .innerJoin(
        apiOperations,
        and(
          eq(apiOperations.organizationId, behaviorDefinitions.organizationId),
          eq(apiOperations.id, behaviorDefinitions.apiOperationId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(ledgerEntries.lastObservedAt), desc(ledgerEntries.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const evidenceRows =
      pageRows.length === 0
        ? []
        : await tx
            .select({
              dependencyClaimId: claimEvidence.dependencyClaimId,
              receiptId: receipts.id,
              receiptType: receipts.receiptType,
              receiptAvailability: receipts.availabilityStatus,
              receiptExpiresAt: receipts.expiresAt,
              evidenceRole: claimEvidence.evidenceRole,
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
                inArray(
                  claimEvidence.dependencyClaimId,
                  pageRows.map((row) => row.dependencyClaimId),
                ),
              ),
            )
            .orderBy(desc(claimEvidence.createdAt));
    const receiptByClaim = new Map<string, (typeof evidenceRows)[number]>();
    for (const evidence of evidenceRows) {
      const current = receiptByClaim.get(evidence.dependencyClaimId);
      if (!current || (current.evidenceRole !== "primary" && evidence.evidenceRole === "primary")) {
        receiptByClaim.set(evidence.dependencyClaimId, evidence);
      }
    }
    const records = pageRows.map((row) => {
      const receipt = receiptByClaim.get(row.dependencyClaimId);
      return {
        id: row.id,
        dependencyClaimId: row.dependencyClaimId,
        consumer: { id: row.consumerId, displayAlias: row.consumerAlias },
        operation: { method: row.method, path: row.path, displayName: row.operationName },
        behavior: { id: row.behaviorId, kind: row.behaviorKind, label: row.behaviorLabel },
        tier: row.tier,
        claimStatus: row.claimStatus,
        deterministicEligible: row.deterministicEligible,
        supportCount: row.supportCount.toString(),
        reviewState: row.reviewState,
        freshnessStatus: row.freshnessStatus,
        firstDetectedAt: row.firstDetectedAt,
        lastObservedAt: row.lastObservedAt,
        updatedAt: row.updatedAt,
        receipt: receipt
          ? {
              id: receipt.receiptId,
              type: receipt.receiptType,
              availability: receipt.receiptAvailability,
              expiresAt: receipt.receiptExpiresAt,
            }
          : null,
      };
    });
    const last = pageRows.at(-1);
    return {
      records,
      nextCursor:
        rows.length > limit && last ? { lastObservedAt: last.lastObservedAt, id: last.id } : null,
    };
  });
}

export class LedgerReviewError extends Error {
  constructor(
    public readonly code: "not_found" | "conflict" | "invalid_transition",
    message: string,
  ) {
    super(message);
    this.name = "LedgerReviewError";
  }
}

const tierRank = { t3: 0, t2: 1, t1: 2 } as const;

export async function reviewLedgerClaim(
  db: Database,
  organizationId: string,
  ledgerEntryId: string,
  actor: { membershipId: string; userId: string; requestId: string },
  input: {
    decision: "confirmed" | "demoted" | "promoted" | "dismissed";
    toTier?: "t1" | "t2" | "t3";
    reason: string;
    expectedUpdatedAt: Date;
  },
): Promise<{ id: string; reviewState: typeof input.decision; updatedAt: Date }> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [entry] = await tx
      .select({
        id: ledgerEntries.id,
        claimId: dependencyClaims.id,
        tier: dependencyClaims.tier,
        deterministicEligible: dependencyClaims.deterministicEligible,
        reviewState: ledgerEntries.reviewState,
        updatedAt: ledgerEntries.updatedAt,
      })
      .from(ledgerEntries)
      .innerJoin(
        dependencyClaims,
        and(
          eq(dependencyClaims.organizationId, ledgerEntries.organizationId),
          eq(dependencyClaims.id, ledgerEntries.dependencyClaimId),
        ),
      )
      .where(
        and(
          eq(ledgerEntries.organizationId, organizationId),
          eq(ledgerEntries.id, ledgerEntryId),
          eq(dependencyClaims.status, "active"),
        ),
      )
      .limit(1);
    if (!entry) throw new LedgerReviewError("not_found", "Ledger entry was not found");
    if (entry.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new LedgerReviewError("conflict", "Ledger entry changed; refresh before reviewing");
    }

    const [latestDecision] = await tx
      .select({
        id: claimReviewDecisions.id,
        toTier: claimReviewDecisions.toTier,
      })
      .from(claimReviewDecisions)
      .where(
        and(
          eq(claimReviewDecisions.organizationId, organizationId),
          eq(claimReviewDecisions.dependencyClaimId, entry.claimId),
        ),
      )
      .orderBy(desc(claimReviewDecisions.createdAt), desc(claimReviewDecisions.id))
      .limit(1);
    const effectiveTier = latestDecision?.toTier ?? entry.tier;
    const tierChanging = input.decision === "demoted" || input.decision === "promoted";
    if (tierChanging !== Boolean(input.toTier)) {
      throw new LedgerReviewError(
        "invalid_transition",
        tierChanging ? "A target tier is required" : "This decision cannot set a target tier",
      );
    }
    if (
      input.decision === "demoted" &&
      input.toTier &&
      tierRank[input.toTier] >= tierRank[effectiveTier]
    ) {
      throw new LedgerReviewError("invalid_transition", "Demotion must select a lower tier");
    }
    if (
      input.decision === "promoted" &&
      input.toTier &&
      tierRank[input.toTier] <= tierRank[effectiveTier]
    ) {
      throw new LedgerReviewError("invalid_transition", "Promotion must select a higher tier");
    }
    if (input.decision === "promoted" && input.toTier === "t1" && !entry.deterministicEligible) {
      throw new LedgerReviewError(
        "invalid_transition",
        "T1 requires deterministic complete-session echo evidence",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(ledgerEntries)
      .set({
        reviewState: input.decision,
        acknowledgedAt: input.decision === "dismissed" ? null : now,
        resolvedAt: input.decision === "dismissed" ? now : null,
        resolutionNote: input.decision === "dismissed" ? input.reason : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(ledgerEntries.organizationId, organizationId),
          eq(ledgerEntries.id, ledgerEntryId),
          sql`date_trunc('milliseconds', ${ledgerEntries.updatedAt}) = ${input.expectedUpdatedAt.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: ledgerEntries.id, updatedAt: ledgerEntries.updatedAt });
    if (!updated) throw new LedgerReviewError("conflict", "A concurrent review won the update");

    await tx.insert(claimReviewDecisions).values({
      organizationId,
      dependencyClaimId: entry.claimId,
      membershipId: actor.membershipId,
      decision: input.decision,
      fromTier: effectiveTier,
      toTier: input.toTier,
      reason: input.reason,
      recentAuthAt: now,
      supersedesDecisionId: latestDecision?.id,
    });
    const [eventCount] = await tx
      .select({ value: count() })
      .from(claimReviewDecisions)
      .where(
        and(
          eq(claimReviewDecisions.organizationId, organizationId),
          eq(claimReviewDecisions.dependencyClaimId, entry.claimId),
        ),
      );
    const payload = {
      ledgerEntryId,
      dependencyClaimId: entry.claimId,
      decision: input.decision,
      fromTier: effectiveTier,
      toTier: input.toTier ?? null,
    };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "claim.reviewed",
        resourceType: "dependency_claim",
        resourceId: entry.claimId,
        requestId: actor.requestId,
        changes: payload,
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId,
        topic: "claim.reviewed",
        aggregateType: "dependency_claim",
        aggregateId: entry.claimId,
        eventVersion: Number(eventCount?.value ?? 1),
        payload,
        payloadDigest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      }),
    ]);
    return { id: updated.id, reviewState: input.decision, updatedAt: updated.updatedAt };
  });
}

export async function authorizeReceiptRead(
  db: Database,
  organizationId: string,
  receiptId: string,
  actor: {
    actorId: string;
    requestId: string;
    actorType?: "user" | "platform_operator";
    supportAccessGrantId?: string;
  },
): Promise<{ objectKey: string; bucket: string } | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [receipt] = await tx
      .select({
        objectKey: storedObjects.objectKey,
        bucket: storedObjects.bucket,
        receiptAvailability: receipts.availabilityStatus,
        objectAvailability: storedObjects.availabilityStatus,
        expiresAt: receipts.expiresAt,
      })
      .from(receipts)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.organizationId, receipts.organizationId),
          eq(storedObjects.id, receipts.storedObjectId),
          isNull(storedObjects.deletedAt),
        ),
      )
      .where(and(eq(receipts.organizationId, organizationId), eq(receipts.id, receiptId)))
      .limit(1);
    const allowed =
      receipt?.receiptAvailability === "available" &&
      receipt.objectAvailability === "available" &&
      receipt.expiresAt.getTime() > Date.now();
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: actor.actorType ?? "user",
      actorId: actor.actorId,
      supportAccessGrantId: actor.supportAccessGrantId,
      action: "receipt.read_url_issued",
      resourceType: "receipt",
      resourceId: receiptId,
      requestId: actor.requestId,
      changes: {},
      outcome: allowed ? "succeeded" : receipt ? "denied" : "failed",
    });
    return allowed && receipt ? { objectKey: receipt.objectKey, bucket: receipt.bucket } : null;
  });
}
