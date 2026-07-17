import {
  type ClaimedJob,
  claimJobs,
  completeJob,
  type Database,
  type DatabaseTransaction,
  dispatchScheduledTasks,
  failJob,
  renewJobLease,
  withOrganizationContext,
} from "@hyrum/db";
import type { Logger } from "@hyrum/logger";

export interface JobExecutionContext {
  /** Tenant jobs receive a transaction with transaction-local FORCE RLS context. */
  db: Database | DatabaseTransaction;
  organizationId: string | null;
  signal: AbortSignal;
}

export type JobHandler = (job: ClaimedJob, context: JobExecutionContext) => Promise<void>;

export interface WorkerOptions {
  db: Database;
  logger: Logger;
  workerId: string;
  handlers?: ReadonlyMap<string, JobHandler>;
  pollIntervalMs?: number;
  leaseDurationMs?: number;
  leaseHeartbeatMs?: number;
  claimLimit?: number;
}

export class JobLeaseLostError extends Error {
  constructor(jobId: string) {
    super(`Lease ownership was lost for job ${jobId}`);
    this.name = "JobLeaseLostError";
  }
}

async function executeHandler(
  options: WorkerOptions,
  job: ClaimedJob,
  handler: JobHandler,
  signal: AbortSignal,
): Promise<void> {
  if (!job.organizationId) {
    await handler(job, { db: options.db, organizationId: null, signal });
    return;
  }

  await withOrganizationContext(options.db, job.organizationId, async (transaction) => {
    await handler(job, { db: transaction, organizationId: job.organizationId, signal });

    // Fence the handler's tenant transaction immediately before commit. If another
    // worker reclaimed the job, throwing here rolls back all tenant database writes.
    if (!(await renewJobLease(transaction, job, options.leaseDurationMs))) {
      throw new JobLeaseLostError(job.id);
    }
  });
}

/** Process one claimed job with heartbeat renewal and lease-token fencing. */
export async function runClaimedJob(
  options: WorkerOptions,
  job: ClaimedJob,
  handler: JobHandler,
): Promise<void> {
  const leaseDurationMs = options.leaseDurationMs ?? 60_000;
  const heartbeatMs = options.leaseHeartbeatMs ?? Math.max(1_000, Math.floor(leaseDurationMs / 3));
  if (heartbeatMs >= leaseDurationMs) {
    throw new RangeError("leaseHeartbeatMs must be shorter than leaseDurationMs");
  }

  const handlerController = new AbortController();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let renewalInFlight: Promise<void> | undefined;
  let leaseLost = false;

  heartbeat = setInterval(() => {
    if (renewalInFlight || leaseLost) return;
    renewalInFlight = (async () => {
      try {
        if (!(await renewJobLease(options.db, job, leaseDurationMs))) {
          leaseLost = true;
          handlerController.abort(new JobLeaseLostError(job.id));
          options.logger.warn({ jobId: job.id, leaseOwner: job.leaseOwner }, "job lease lost");
        }
      } catch (error) {
        // A transient renewal error is logged; the final fenced renewal still decides
        // whether tenant work may commit.
        options.logger.error({ err: error, jobId: job.id }, "job lease renewal failed");
      } finally {
        renewalInFlight = undefined;
      }
    })();
  }, heartbeatMs);

  try {
    await executeHandler(options, job, handler, handlerController.signal);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await renewalInFlight;
  }

  if (leaseLost || !(await completeJob(options.db, job))) {
    throw new JobLeaseLostError(job.id);
  }
}

export async function runWorker(options: WorkerOptions, signal: AbortSignal): Promise<void> {
  const handlers = options.handlers ?? new Map();
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  let nextScheduleDispatchAt = 0;

  while (!signal.aborted) {
    if (Date.now() >= nextScheduleDispatchAt) {
      await dispatchScheduledTasks(options.db);
      nextScheduleDispatchAt = Date.now() + 30_000;
    }
    const jobs = await claimJobs(
      options.db,
      options.workerId,
      options.claimLimit,
      options.leaseDurationMs,
    );
    for (const job of jobs) {
      const handler = handlers.get(job.type);
      try {
        if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);
        await runClaimedJob(options, job, handler);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error("Unknown job failure");
        options.logger.error({ err: normalized, jobId: job.id, jobType: job.type }, "job failed");
        if (!(normalized instanceof JobLeaseLostError)) {
          const recorded = await failJob(options.db, job, normalized);
          if (!recorded) {
            options.logger.warn(
              { jobId: job.id, leaseOwner: job.leaseOwner },
              "job failure ignored because lease ownership changed",
            );
          }
        }
      }
    }

    if (jobs.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
