import { jobs, sql, type TenantDb } from "@hyrum/db";

const freshnessWindowMs = 90 * 86_400_000;

export function ledgerFreshnessUntil(observedAt: Date) {
  return new Date(observedAt.getTime() + freshnessWindowMs);
}

export async function scheduleLedgerFreshness(
  tx: TenantDb,
  organizationId: string,
  freshnessUntil: Date,
) {
  await tx
    .insert(jobs)
    .values({
      organizationId,
      type: "ledger.freshness",
      payload: {},
      runAfter: freshnessUntil,
      idempotencyKey: `ledger.freshness:${freshnessUntil.toISOString().slice(0, 10)}`,
    })
    .onConflictDoUpdate({
      target: [jobs.organizationId, jobs.idempotencyKey],
      set: {
        status: "pending",
        attempts: 0,
        runAfter: sql`least(${jobs.runAfter}, ${freshnessUntil.toISOString()}::timestamptz)`,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      },
    });
}
