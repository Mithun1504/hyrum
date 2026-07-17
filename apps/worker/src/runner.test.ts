import type { ClaimedJob, Database } from "@hyrum/db";
import type { Logger } from "@hyrum/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  renewJobLease: vi.fn(),
  withOrganizationContext: vi.fn(),
}));

vi.mock("@hyrum/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hyrum/db")>()),
  ...dbMocks,
}));

import { JobLeaseLostError, runClaimedJob } from "./runner";

const database = {} as Database;
const logger = {
  error: vi.fn(),
  warn: vi.fn(),
} as unknown as Logger;
const job: ClaimedJob = {
  id: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000002",
  type: "test",
  payload: { test: true },
  attempts: 1,
  maxAttempts: 5,
  leaseOwner: "worker:claim-token",
  leaseExpiresAt: new Date(Date.now() + 60_000),
};

describe("job runner lease safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.completeJob.mockResolvedValue(true);
    dbMocks.renewJobLease.mockResolvedValue(true);
    dbMocks.withOrganizationContext.mockImplementation(
      async (
        _db: Database,
        _organizationId: string,
        operation: (tx: Database) => Promise<unknown>,
      ) => operation({} as Database),
    );
  });

  it("executes tenant handlers inside explicit organization context", async () => {
    const handler = vi.fn();
    await runClaimedJob(
      { db: database, logger, workerId: "worker", leaseDurationMs: 10_000 },
      { ...job },
      handler,
    );

    expect(dbMocks.withOrganizationContext).toHaveBeenCalledWith(
      database,
      job.organizationId,
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id }),
      expect.objectContaining({ organizationId: job.organizationId }),
    );
    expect(dbMocks.completeJob).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ id: job.id }),
    );
  });

  it("rolls back tenant work when the final lease fence is stale", async () => {
    dbMocks.renewJobLease.mockResolvedValue(false);

    await expect(
      runClaimedJob(
        { db: database, logger, workerId: "worker", leaseDurationMs: 10_000 },
        { ...job },
        vi.fn(),
      ),
    ).rejects.toBeInstanceOf(JobLeaseLostError);
    expect(dbMocks.completeJob).not.toHaveBeenCalled();
  });

  it("rejects completion by a stale worker", async () => {
    dbMocks.completeJob.mockResolvedValue(false);

    await expect(
      runClaimedJob(
        { db: database, logger, workerId: "worker", leaseDurationMs: 10_000 },
        { ...job },
        vi.fn(),
      ),
    ).rejects.toBeInstanceOf(JobLeaseLostError);
  });
});
