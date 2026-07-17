import { and, eq, lte, sql } from "drizzle-orm";
import { receipts, storedObjects } from "./schema";
import type { DatabaseTransaction } from "./tenancy";

export async function refreshLedgerFreshness(
  tx: DatabaseTransaction,
  organizationId: string,
  now = new Date(),
): Promise<void> {
  await tx.execute(sql`
    update ledger_entries entry
    set freshness_status = case
          when entry.last_observed_at + (organization.stale_after_days * interval '1 day') <= ${now}
            then 'stale'::freshness_status
          when entry.last_observed_at + ((organization.stale_after_days / 2.0) * interval '1 day') <= ${now}
            then 'aging'::freshness_status
          else 'fresh'::freshness_status
        end,
        stale_at = entry.last_observed_at + (organization.stale_after_days * interval '1 day'),
        updated_at = ${now}
    from organizations organization
    where entry.organization_id = ${organizationId}
      and organization.id = entry.organization_id
      and entry.freshness_status is distinct from case
        when entry.last_observed_at + (organization.stale_after_days * interval '1 day') <= ${now}
          then 'stale'::freshness_status
        when entry.last_observed_at + ((organization.stale_after_days / 2.0) * interval '1 day') <= ${now}
          then 'aging'::freshness_status
        else 'fresh'::freshness_status
      end
  `);
}

export async function listExpiredObjects(
  tx: DatabaseTransaction,
  organizationId: string,
  now = new Date(),
  limit = 100,
) {
  return tx
    .select({ id: storedObjects.id, objectKey: storedObjects.objectKey })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.organizationId, organizationId),
        eq(storedObjects.availabilityStatus, "available"),
        lte(storedObjects.expiresAt, now),
      ),
    )
    .orderBy(storedObjects.expiresAt)
    .limit(limit);
}

export async function markObjectRetentionDeleted(
  tx: DatabaseTransaction,
  organizationId: string,
  objectId: string,
  now = new Date(),
): Promise<void> {
  await tx
    .update(storedObjects)
    .set({
      availabilityStatus: "deleted",
      deletedAt: now,
      deletionReason: "retention_expired",
    })
    .where(
      and(
        eq(storedObjects.organizationId, organizationId),
        eq(storedObjects.id, objectId),
        eq(storedObjects.availabilityStatus, "available"),
      ),
    );
  await tx
    .update(receipts)
    .set({ availabilityStatus: "expired" })
    .where(and(eq(receipts.organizationId, organizationId), eq(receipts.storedObjectId, objectId)));
}
