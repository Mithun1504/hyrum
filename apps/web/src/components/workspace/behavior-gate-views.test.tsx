import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  EvidenceTier,
  LedgerRow,
  ReplayDelta,
  WorkspaceSnapshot,
} from "@/services/workspace-data";
import { GateView } from "./behavior-gate-views";

const claimIds = {
  T1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  T2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  T3: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
} satisfies Record<EvidenceTier, string>;

describe("GateView", () => {
  it("renders gate delta labels by tier without promoting exposure or unmatched deltas to warnings", () => {
    render(
      <GateView snapshot={snapshotWithDeltas([delta("T1"), delta("T2"), delta("T3"), delta()])} />,
    );

    expect(deltaRow("$.t1")).toHaveTextContent("T1");
    expect(deltaRow("$.t1")).toHaveTextContent("BLOCK");

    expect(deltaRow("$.t2")).toHaveTextContent("T2");
    expect(deltaRow("$.t2")).toHaveTextContent("WARN");

    expect(deltaRow("$.t3")).toHaveTextContent("T3");
    expect(deltaRow("$.t3")).toHaveTextContent("EXPOSURE");
    expect(within(deltaRow("$.t3")).queryByText("WARN")).not.toBeInTheDocument();

    expect(deltaRow("$.unmatched")).toHaveTextContent("NOTE");
    expect(within(deltaRow("$.unmatched")).queryByText("T3")).not.toBeInTheDocument();
    expect(within(deltaRow("$.unmatched")).queryByText("WARN")).not.toBeInTheDocument();
  });
});

function delta(tier?: EvidenceTier): ReplayDelta {
  return {
    kind: "shape",
    path: tier ? `$.${tier.toLowerCase()}` : "$.unmatched",
    before: "present",
    after: "absent",
    digest: `sha256:${tier ?? "unmatched"}`,
    matches: tier ? [{ claim_id: claimIds[tier], tier }] : [],
  };
}

function deltaRow(path: string) {
  const row = screen.getByText(`${path} · shape delta`).closest("div");
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function snapshotWithDeltas(deltas: ReplayDelta[]): WorkspaceSnapshot {
  return {
    apiStatus: "ok",
    dataMode: "live",
    dataErrors: [],
    role: "engineer",
    summary: null,
    permissions: { canPinAssertion: true, reason: null },
    filters: { query: "", selectedId: null, tier: "all", kind: "all", state: "all" },
    consumers: [],
    allLedgerRows: (Object.keys(claimIds) as EvidenceTier[]).map((tier) => ledgerRow(tier)),
    ledgerRows: (Object.keys(claimIds) as EvidenceTier[]).map((tier) => ledgerRow(tier)),
    selected: null,
    receipt: null,
    assertions: [],
    gatePolicy: {
      id: "88888888-8888-4888-8888-888888888888",
      version: 1,
      block_tiers: ["T1"],
      warn_tiers: ["T2"],
      active: true,
    },
    replayReport: {
      id: "77777777-7777-4777-8777-777777777777",
      generated_at: "2026-07-15T08:00:00.000Z",
      base_url: "https://ci.example.test/base",
      candidate_url: "https://ci.example.test/candidate",
      base_image_digest: `sha256:${"a".repeat(64)}`,
      candidate_image_digest: `sha256:${"b".repeat(64)}`,
      extractor_version: "extractors-go-0.4.1",
      corpus_digest: "sha256:fixture",
      runs: 1,
      results: [{ case_id: "case", stable: true, quarantined: false, deltas }],
      decision: {
        outcome: "block",
        block_count: 1,
        warn_count: 1,
        note_count: 2,
        reasons: [],
      },
      assertion_results: [],
    },
    progressEvents: [],
    defaultAssertionExpiry: "2026-10-13T08:00:00.000Z",
  };
}

function ledgerRow(tier: EvidenceTier): LedgerRow {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${tier.slice(1)}`,
    claim_id: claimIds[tier],
    behavior_id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${tier.slice(1)}`,
    consumer_id: `11111111-1111-4111-8111-11111111111${tier.slice(1)}`,
    operation_id: null,
    kind: "shape",
    tier,
    state: "active",
    title: `${tier} claim`,
    last_seen_at: "2026-07-15T08:00:00.000Z",
    freshness_until: "2026-10-13T08:00:00.000Z",
    receipt_id: null,
    endpoint: "GET /v1/orders",
    consumer_alias: `${tier} consumer`,
    consumer_stable_id: `${tier.toLowerCase()}_consumer`,
    impact:
      tier === "T1"
        ? "T1 block impact."
        : tier === "T2"
          ? "T2 warning impact."
          : "T3 exposure impact.",
    evidence_summary: "Redacted receipt is available.",
    owner: "Platform API",
    receipt_digest: null,
    observation_count: 12,
    session_count: 3,
  };
}
