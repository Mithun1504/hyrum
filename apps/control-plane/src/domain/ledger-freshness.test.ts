import { describe, expect, it, vi } from "vitest";
import { ledgerFreshnessUntil, scheduleLedgerFreshness } from "./ledger-freshness";

const organizationId = "00000000-0000-4000-8000-000000000001";

describe("ledger freshness", () => {
  it("marks observations stale after the documented 90-day window", () => {
    expect(ledgerFreshnessUntil(new Date("2026-07-15T08:15:30.000Z"))).toEqual(
      new Date("2026-10-13T08:15:30.000Z"),
    );
  });

  it("keeps one pending tenant job per stale date and moves it to the earliest expiry", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const tx = { insert: vi.fn(() => ({ values })) };
    const freshnessUntil = new Date("2026-10-13T08:15:30.000Z");

    await scheduleLedgerFreshness(tx as never, organizationId, freshnessUntil);

    expect(values).toHaveBeenCalledWith({
      organizationId,
      type: "ledger.freshness",
      payload: {},
      runAfter: freshnessUntil,
      idempotencyKey: "ledger.freshness:2026-10-13",
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          status: "pending",
          attempts: 0,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          runAfter: expect.anything(),
        }),
      }),
    );
  });
});
