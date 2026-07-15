import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import type { Database } from "./index";
import { jobs } from "./schema";

export interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export async function claimJobs(db: Database, workerId: string, limit = 10): Promise<ClaimedJob[]> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 60_000);

  return db.transaction(async (tx) => {
    const claimable = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "pending"),
          lte(jobs.runAfter, now),
          or(sql`${jobs.leaseExpiresAt} is null`, lte(jobs.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(jobs.runAfter))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (claimable.length === 0) return [];

    const claimed: ClaimedJob[] = [];
    for (const { id } of claimable) {
      const [job] = await tx
        .update(jobs)
        .set({
          status: "running",
          leaseOwner: workerId,
          leaseExpiresAt,
          attempts: sql`${jobs.attempts} + 1`,
        })
        .where(eq(jobs.id, id))
        .returning({
          id: jobs.id,
          type: jobs.type,
          payload: jobs.payload,
          attempts: jobs.attempts,
          maxAttempts: jobs.maxAttempts,
        });
      if (job) claimed.push(job);
    }
    return claimed;
  });
}

export async function completeJob(db: Database, id: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "succeeded", leaseOwner: null, leaseExpiresAt: null })
    .where(eq(jobs.id, id));
}

export async function failJob(db: Database, job: ClaimedJob, error: Error): Promise<void> {
  const terminal = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(2 ** job.attempts, 300);
  await db
    .update(jobs)
    .set({
      status: terminal ? "dead" : "pending",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: error.name.slice(0, 100),
      lastErrorSummary: error.message.slice(0, 2_000),
      runAfter: new Date(Date.now() + delaySeconds * 1_000),
    })
    .where(eq(jobs.id, job.id));
}
