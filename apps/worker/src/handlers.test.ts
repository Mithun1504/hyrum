import { dependencyClaims, ledgerEntries } from "@hyrum/db";
import { describe, expect, it, vi } from "vitest";

const publishGitHubCheckRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const publishSlackGateNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@hyrum/integrations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hyrum/integrations")>()),
  publishGitHubCheckRun,
  publishSlackGateNotification,
}));

import { createDefaultHandlers } from "./handlers";

describe("createDefaultHandlers", () => {
  it("registers concrete worker handlers and removes the old ledger aggregate path", () => {
    const handlers = createDefaultHandlers();

    expect(handlers.has("assertions.expire")).toBe(true);
    expect(handlers.has("receipts.cleanup")).toBe(true);
    expect(handlers.has("ledger.freshness")).toBe(true);
    expect(handlers.has("outbox.publish")).toBe(true);
    expect(handlers.has("ledger.aggregate")).toBe(false);
  });

  it("expires the scheduled assertion and emits its progress event", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const values = vi.fn().mockResolvedValue(undefined);
    const db = {
      update: vi.fn(() => ({ set })),
      insert: vi.fn(() => ({ values })),
    };
    const handler = createDefaultHandlers().get("assertions.expire");

    await handler?.(
      {
        id: "00000000-0000-4000-8000-000000000100",
        organizationId: "00000000-0000-4000-8000-000000000001",
        type: "assertions.expire",
        payload: { assertion_id: "00000000-0000-4000-8000-000000000010" },
        attempts: 1,
        maxAttempts: 5,
      },
      db as never,
    );

    expect(set).toHaveBeenCalledWith({ status: "expired" });
    expect(returning).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "00000000-0000-4000-8000-000000000001",
        resourceId: "00000000-0000-4000-8000-000000000010",
      }),
    );
  });

  it("rejects expiry jobs without a valid assertion id", async () => {
    const handler = createDefaultHandlers().get("assertions.expire");
    await expect(
      handler?.(
        {
          id: "00000000-0000-4000-8000-000000000100",
          organizationId: "00000000-0000-4000-8000-000000000001",
          type: "assertions.expire",
          payload: {},
          attempts: 1,
          maxAttempts: 5,
        },
        {} as never,
      ),
    ).rejects.toThrow();
  });

  it("deletes expired receipt objects while retaining tenant-scoped metadata", async () => {
    const objectKey = `organizations/00000000-0000-4000-8000-000000000001/receipt/sha256/${"a".repeat(64)}`;
    const limit = vi
      .fn()
      .mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000020", objectKey }]);
    const whereSelect = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: whereSelect }));
    const whereUpdate = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where: whereUpdate }));
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const db = {
      select: vi.fn(() => ({ from })),
      update: vi.fn(() => ({ set })),
    };
    const handler = createDefaultHandlers({ objectStorage: { deleteObject } }).get(
      "receipts.cleanup",
    );

    await handler?.(job("receipts.cleanup", {}), db as never);

    expect(deleteObject).toHaveBeenCalledWith({
      organizationId: "00000000-0000-4000-8000-000000000001",
      key: objectKey,
    });
    expect(set).toHaveBeenCalledWith({
      objectKey: null,
      excerpt: { unavailable: true, reason: "retention_expired" },
      updatedAt: expect.any(Date),
    });
    expect(whereUpdate).toHaveBeenCalledOnce();
    expect(deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      whereUpdate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("marks an expired entry stale and schedules a later same-day expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-10-13T08:00:00.000Z");
    const expired = [
      {
        id: "00000000-0000-4000-8000-000000000021",
        claimId: "00000000-0000-4000-8000-000000000031",
      },
    ];
    const nextFreshness = new Date("2026-10-13T18:00:00.000Z");
    const limit = vi.fn().mockResolvedValue(expired);
    const fromExpired = vi.fn(() => ({ where: vi.fn(() => ({ limit })) }));
    const claimLock = vi.fn().mockResolvedValue(expired.map(({ claimId }) => ({ id: claimId })));
    const fromClaims = vi.fn(() => ({ where: vi.fn(() => ({ for: claimLock })) }));
    const nextLimit = vi.fn().mockResolvedValue([{ freshnessUntil: nextFreshness }]);
    const fromNext = vi.fn(() => ({
      where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: nextLimit })) })),
    }));
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({ from: fromExpired }))
      .mockImplementationOnce(() => ({ from: fromClaims }))
      .mockImplementationOnce(() => ({ from: fromNext }));
    const returning = vi.fn().mockResolvedValue(expired.map(({ claimId }) => ({ claimId })));
    const whereUpdate = vi.fn().mockReturnValueOnce({ returning }).mockResolvedValueOnce(undefined);
    const set = vi.fn(() => ({ where: whereUpdate }));
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const db = {
      select,
      update: vi.fn(() => ({ set })),
      insert: vi.fn(() => ({ values })),
    };
    const handler = createDefaultHandlers().get("ledger.freshness");

    try {
      await handler?.(job("ledger.freshness", { limit: 2 }), db as never);
    } finally {
      vi.useRealTimers();
    }

    expect(fromExpired).toHaveBeenCalledWith(ledgerEntries);
    expect(fromClaims).toHaveBeenCalledWith(dependencyClaims);
    expect(claimLock).toHaveBeenCalledWith("update");
    expect(db.update).toHaveBeenNthCalledWith(1, ledgerEntries);
    expect(db.update).toHaveBeenNthCalledWith(2, dependencyClaims);
    expect(set).toHaveBeenNthCalledWith(1, { state: "stale", updatedAt: expect.any(Date) });
    expect(set).toHaveBeenNthCalledWith(2, { state: "stale", updatedAt: expect.any(Date) });
    expect(returning).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "00000000-0000-4000-8000-000000000001",
        type: "ledger.freshness",
        payload: { limit: 2 },
        runAfter: nextFreshness,
        idempotencyKey: "ledger.freshness:followup:00000000-0000-4000-8000-000000000100",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("publishes capture outbox events once and marks only that tenant event", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        topic: "capture.batch_ingested",
        payload: { resource_id: "batch_1", payload: { accepted_count: 1 } },
      },
    ]);
    const from = vi.fn(() => ({ where: vi.fn(() => ({ limit })) }));
    const values = vi.fn().mockResolvedValue(undefined);
    const whereUpdate = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where: whereUpdate }));
    const db = {
      select: vi.fn(() => ({ from })),
      insert: vi.fn(() => ({ values })),
      update: vi.fn(() => ({ set })),
    };
    const handler = createDefaultHandlers().get("outbox.publish");

    await handler?.(
      job("outbox.publish", {
        outbox_event_id: "00000000-0000-4000-8000-000000000030",
      }),
      db as never,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "00000000-0000-4000-8000-000000000001",
        topic: "capture.batch_ingested",
        resourceId: "batch_1",
      }),
    );
    expect(set).toHaveBeenCalledWith({ attempts: 1, publishedAt: expect.any(Date) });
  });

  it("re-reads the active tenant GitHub destination before publishing", async () => {
    publishGitHubCheckRun.mockClear();
    const event = {
      topic: "integration.gate_decided",
      payload: queuedGateEvent(),
    };
    const select = vi
      .fn()
      .mockImplementationOnce(() => selectChain([event]))
      .mockImplementationOnce(() =>
        selectChain([{ installationId: 91, owner: "hyrum", name: "demo" }]),
      );
    const whereUpdate = vi.fn().mockResolvedValue(undefined);
    const db = {
      select,
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: whereUpdate })) })),
    };
    const handler = createDefaultHandlers({
      githubApp: { appId: "1", privateKey: "private-key" },
    }).get("outbox.publish");

    await handler?.(
      job("outbox.publish", {
        outbox_event_id: "00000000-0000-4000-8000-000000000030",
      }),
      db as never,
    );

    expect(select).toHaveBeenCalledTimes(2);
    expect(publishGitHubCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        github: expect.objectContaining({
          installationId: 91,
          repository: { owner: "hyrum", name: "demo" },
        }),
      }),
      { appId: "1", privateKey: "private-key" },
    );
    expect(whereUpdate).toHaveBeenCalledOnce();
  });

  it("rejects an inactive or cross-tenant GitHub destination at delivery time", async () => {
    publishGitHubCheckRun.mockClear();
    const select = vi
      .fn()
      .mockImplementationOnce(() =>
        selectChain([{ topic: "integration.gate_decided", payload: queuedGateEvent() }]),
      )
      .mockImplementationOnce(() => selectChain([]));
    const update = vi.fn();
    const handler = createDefaultHandlers({
      githubApp: { appId: "1", privateKey: "private-key" },
    }).get("outbox.publish");

    await expect(
      handler?.(
        job("outbox.publish", {
          outbox_event_id: "00000000-0000-4000-8000-000000000030",
        }),
        { select, update } as never,
      ),
    ).rejects.toThrow("GitHub integration is not active for this tenant");
    expect(publishGitHubCheckRun).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
}

function queuedGateEvent() {
  return {
    reportId: "00000000-0000-4000-8000-000000000071",
    detailsUrl: "https://app.example.test/replays/report-1",
    decision: {
      outcome: "block" as const,
      blockCount: 1,
      warnCount: 0,
      noteCount: 0,
      reasons: ["T1 echo changed"],
    },
    github: {
      integrationId: "00000000-0000-4000-8000-000000000091",
      headSha: "f4e5d6c",
      pullRequest: 42,
    },
  };
}

function job(type: string, payload: unknown) {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    organizationId: "00000000-0000-4000-8000-000000000001",
    type,
    payload,
    attempts: 1,
    maxAttempts: 5,
  };
}
