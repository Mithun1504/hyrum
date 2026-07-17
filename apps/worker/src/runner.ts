import {
  type ClaimedJob,
  claimJobs,
  completeJob,
  type Database,
  failJob,
  type TenantDb,
  withTenant,
} from "@hyrum/db";
import type { Logger } from "@hyrum/logger";

export type JobHandler = (job: ClaimedJob, db: TenantDb) => Promise<void>;

export interface WorkerOptions {
  db: Database;
  logger: Logger;
  workerId: string;
  handlers?: ReadonlyMap<string, JobHandler>;
  pollIntervalMs?: number;
}

export async function runWorker(options: WorkerOptions, signal: AbortSignal): Promise<void> {
  const handlers = options.handlers ?? new Map();
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;

  while (!signal.aborted) {
    const jobs = await claimJobs(options.db, options.workerId);
    for (const job of jobs) {
      const handler = handlers.get(job.type);
      try {
        if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);
        await withTenant(options.db, job.organizationId, (tenantDb) => handler(job, tenantDb));
        await completeJob(options.db, job.id, options.workerId);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error("Unknown job failure");
        options.logger.error({ err: normalized, jobId: job.id, jobType: job.type }, "job failed");
        await failJob(options.db, job, options.workerId, normalized);
      }
    }

    if (jobs.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
