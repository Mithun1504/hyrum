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
  getWorkspaceSummary: async () => Promise.reject(new Error("connection refused")),
  listProgressEvents: async () => Promise.reject(new Error("connection refused")),
};

describe("workspace data", () => {
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
        runs: 3,
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
      getWorkspaceSummary: async () => ({
        organization: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Test organization",
          region: "auto",
          retention_days: 30,
        },
        capture: {
          endpoint_count: 0,
          consumer_count: 0,
          sessions_24h: 0,
          evidence_events_24h: 0,
        },
      }),
      listProgressEvents: async () => [],
    };

    const snapshot = await getWorkspaceSnapshot(filters, { client });

    expect(snapshot.replayReport?.assertion_results).toEqual([assertionResult]);
  });

  it("never falls back to demo rows when the live API is unavailable", async () => {
    const filters = parseFilters(new URLSearchParams());
    const snapshot = await getWorkspaceSnapshot(filters, {
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
