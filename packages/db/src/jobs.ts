import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "./index";
import type { DatabaseTransaction } from "./tenancy";

const DEFAULT_LEASE_DURATION_MS = 60_000;
const MAX_CLAIM_LIMIT = 100;

type JobDatabase = Database | DatabaseTransaction;

export async function dispatchScheduledTasks(db: Database, limit = 100): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("limit must be an integer between 1 and 500");
  }
  const rows = await db.execute<{ dispatched: number }>(
    sql`select hyrum_dispatch_scheduled_tasks(${limit}) as dispatched`,
  );
  return rows[0]?.dispatched ?? 0;
}

export interface ClaimedJob {
  id: string;
  organizationId: string | null;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}

interface ClaimedJobRow extends Record<string, unknown> {
  id: string;
  organization_id: string | null;
  type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  lease_owner: string;
  lease_expires_at: Date;
}

function validateLeaseDuration(leaseDurationMs: number): void {
  if (
    !Number.isInteger(leaseDurationMs) ||
    leaseDurationMs < 5_000 ||
    leaseDurationMs > 3_600_000
  ) {
    throw new RangeError("leaseDurationMs must be an integer between 5000 and 3600000");
  }
}

/**
 * Atomically claims due work across tenants through the narrowly-scoped database
 * function. Each claim call gets a unique lease token, even when the worker ID is
 * reused after a process restart.
 */
export async function claimJobs(
  db: JobDatabase,
  workerId: string,
  limit = 10,
  leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
): Promise<ClaimedJob[]> {
  if (!workerId.trim() || workerId.length > 200) {
    throw new TypeError("workerId must contain between 1 and 200 characters");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CLAIM_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_CLAIM_LIMIT}`);
  }
  validateLeaseDuration(leaseDurationMs);

  const leaseOwner = `${workerId}:${randomUUID()}`;
  const rows = await db.execute<ClaimedJobRow>(sql`
    select * from hyrum_claim_jobs(
      ${leaseOwner},
      ${limit},
      (${leaseDurationMs}::double precision * interval '1 millisecond')
    )
  `);

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
  }));
}

/** Extend a live lease. A false result means this worker no longer owns the job. */
export async function renewJobLease(
  db: JobDatabase,
  job: ClaimedJob,
  leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
): Promise<boolean> {
  validateLeaseDuration(leaseDurationMs);
  const rows = await db.execute<{ lease_expires_at: Date }>(sql`
    select lease_expires_at
    from hyrum_renew_job_lease(
      ${job.id}::uuid,
      ${job.leaseOwner},
      (${leaseDurationMs}::double precision * interval '1 millisecond')
    )
  `);
  const renewed = rows[0];
  if (!renewed) return false;
  job.leaseExpiresAt = renewed.lease_expires_at;
  return true;
}

/** Complete only the exact, unexpired lease represented by the claimed job. */
export async function completeJob(db: JobDatabase, job: ClaimedJob): Promise<boolean> {
  const rows = await db.execute<{ completed: boolean }>(sql`
    select hyrum_complete_job(${job.id}::uuid, ${job.leaseOwner}) as completed
  `);
  return rows[0]?.completed === true;
}

/** Fail/requeue only the exact, unexpired lease represented by the claimed job. */
export async function failJob(db: JobDatabase, job: ClaimedJob, error: Error): Promise<boolean> {
  const rows = await db.execute<{ failed: boolean }>(sql`
    select hyrum_fail_job(
      ${job.id}::uuid,
      ${job.leaseOwner},
      ${error.name.slice(0, 100)},
      ${error.message.slice(0, 2_000)}
    ) as failed
  `);
  return rows[0]?.failed === true;
}
