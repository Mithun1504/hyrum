import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock("@hyrum/db", () => dbMocks);

const { runWorker } = await import("./runner");

const db = {};
const logger = { error: vi.fn() };

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_1",
    organizationId: "00000000-0000-4000-8000-000000000001",
    type: "test.job",
    payload: {},
    ...overrides,
  };
}

describe("runWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.withTenant.mockImplementation(async (_db, _organizationId, fn) =>
      fn({ tenantScoped: true }),
    );
  });

  it("runs handlers inside the job tenant and completes successful jobs", async () => {
    const controller = new AbortController();
    const claimed = job();
    dbMocks.claimJobs.mockResolvedValueOnce([claimed]);
    const handler = vi.fn(async () => controller.abort());

    await runWorker(
      {
        db: db as never,
        logger: logger as never,
        workerId: "worker-1",
        handlers: new Map([["test.job", handler]]),
        pollIntervalMs: 1,
      },
      controller.signal,
    );

    expect(dbMocks.withTenant).toHaveBeenCalledWith(
      db,
      claimed.organizationId,
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(claimed, { tenantScoped: true });
    expect(dbMocks.completeJob).toHaveBeenCalledWith(db, claimed.id, "worker-1");
    expect(dbMocks.failJob).not.toHaveBeenCalled();
  });

  it("fails jobs with missing handlers without completing them", async () => {
    const controller = new AbortController();
    const claimed = job({ type: "missing.job" });
    dbMocks.claimJobs.mockResolvedValueOnce([claimed]);
    dbMocks.failJob.mockImplementation(async () => controller.abort());

    await runWorker(
      {
        db: db as never,
        logger: logger as never,
        workerId: "worker-1",
        handlers: new Map(),
        pollIntervalMs: 1,
      },
      controller.signal,
    );

    expect(dbMocks.completeJob).not.toHaveBeenCalled();
    expect(dbMocks.failJob).toHaveBeenCalledWith(
      db,
      claimed,
      "worker-1",
      expect.objectContaining({ message: "No handler registered for job type: missing.job" }),
    );
  });
});
