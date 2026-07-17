import { describe, expect, it } from "vitest";
import { getWorkspaceSnapshot, parseFilters } from "./workspace-data";

const unavailableClient = {
  health: async () => Promise.reject(new Error("connection refused")),
  session: async () => Promise.reject(new Error("connection refused")),
  listLedger: async () => Promise.reject(new Error("connection refused")),
  listConsumers: async () => Promise.reject(new Error("connection refused")),
  getReceipt: async () => Promise.reject(new Error("connection refused")),
  listAssertions: async () => Promise.reject(new Error("connection refused")),
  getPolicy: async () => Promise.reject(new Error("connection refused")),
  getLatestReplayRun: async () => Promise.reject(new Error("connection refused")),
};

describe("workspace data", () => {
  it("exposes demo replay assertion results with the required contract shape", async () => {
    const filters = parseFilters(new URLSearchParams());
    const snapshot = await getWorkspaceSnapshot(filters, { demoMode: true });

    expect(snapshot.replayReport?.assertion_results).toEqual([
      {
        assertion_id: "99999999-9999-4999-8999-999999999999",
        behavior_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccca",
        claim_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbba",
        case_id: "orders-validation-template",
        outcome: "fail",
      },
      {
        assertion_id: "99999999-9999-4999-8999-999999999998",
        behavior_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccb",
        claim_id: null,
        case_id: "products-legacy-id-preserved",
        outcome: "pass",
      },
    ]);
  });

  it("keeps live replay assertion results from the control plane", async () => {
    const filters = parseFilters(new URLSearchParams());
    const assertionResult = {
      assertion_id: "99999999-9999-4999-8999-999999999999",
      behavior_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccca",
      claim_id: null,
      case_id: "live-replay-case",
      outcome: "pass" as const,
    };
    const client = {
      health: async () => ({ status: "ok" as const }),
      session: async () => ({ role: "engineer" as const }),
      listLedger: async () => [],
      listConsumers: async () => [],
      getReceipt: unavailableClient.getReceipt,
      listAssertions: async () => [],
      getPolicy: async () => ({
        id: "88888888-8888-4888-8888-888888888888",
        version: 3,
        block_tiers: ["T1" as const],
        warn_tiers: ["T2" as const],
        active: true,
      }),
      getLatestReplayRun: async () => ({
        id: "77777777-7777-4777-8777-777777777777",
        generated_at: "2026-07-15T08:00:00.000Z",
        base_url: "https://ci.example.test/base",
        candidate_url: "https://ci.example.test/candidate",
        base_image_digest: `sha256:${"a".repeat(64)}`,
        candidate_image_digest: `sha256:${"b".repeat(64)}`,
        extractor_version: "extractors-go-0.4.1",
        corpus_digest: "sha256:fixture-50k",
        decision: {
          outcome: "pass" as const,
          block_count: 0,
          warn_count: 0,
          note_count: 0,
          reasons: [],
        },
        deltas: [],
        assertion_results: [assertionResult],
      }),
    };

    const snapshot = await getWorkspaceSnapshot(filters, { client });

    expect(snapshot.replayReport?.assertion_results).toEqual([assertionResult]);
  });

  it("keeps T3 as exposure only in filtered ledger copy", async () => {
    const filters = parseFilters(new URLSearchParams("tier=T3"));
    const snapshot = await getWorkspaceSnapshot(filters, { demoMode: true });

    expect(snapshot.ledgerRows).toHaveLength(1);
    expect(snapshot.ledgerRows[0]?.tier).toBe("T3");
    expect(snapshot.ledgerRows[0]?.impact).toContain("Exposure only");
    expect(snapshot.ledgerRows[0]?.impact).not.toContain("Blocks");
  });

  it("selects the ledger row named by the entry query even when another row is first", async () => {
    const filters = parseFilters(new URLSearchParams("entry=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"));
    const snapshot = await getWorkspaceSnapshot(filters, { demoMode: true });

    expect(snapshot.selected?.tier).toBe("T2");
    expect(snapshot.receipt?.digest).toBe("sha256:65cad5e910c891a0");
  });

  it("never falls back to demo rows when the live API is unavailable", async () => {
    const filters = parseFilters(new URLSearchParams());
    const snapshot = await getWorkspaceSnapshot(filters, {
      demoMode: false,
      client: unavailableClient,
    });

    expect(snapshot.dataMode).toBe("live");
    expect(snapshot.apiStatus).toBe("unavailable");
    expect(snapshot.allLedgerRows).toEqual([]);
    expect(snapshot.ledgerRows).toEqual([]);
    expect(snapshot.consumers).toEqual([]);
    expect(snapshot.replayReport).toBeNull();
    expect(snapshot.dataErrors).toContain("Ledger: connection refused");
    expect(snapshot.dataErrors).toContain("Replay: connection refused");
  });

  it("defaults unknown filter values to all", () => {
    const filters = parseFilters(new URLSearchParams("tier=T4&kind=headers&state=open"));

    expect(filters).toMatchObject({
      tier: "all",
      kind: "all",
      state: "all",
    });
  });
});
