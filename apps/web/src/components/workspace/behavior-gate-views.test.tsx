import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  EvidenceTier,
  LedgerRow,
  ReplayDelta,
  WorkspaceSnapshot,
} from "@/services/workspace-data";
import { GateView } from "./behavior-gate-views";

vi.mock("@/app/(dashboard)/app/actions", () => ({
  overrideClaimAction: vi.fn(),
  pinAssertionAction: vi.fn(),
}));

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
    expect(deltaRow("$.t1")).toHaveTextContent("Matched T1 echo");

    expect(deltaRow("$.t2")).toHaveTextContent("T2");
    expect(deltaRow("$.t2")).toHaveTextContent("Matched T2 pattern");

    expect(deltaRow("$.t3")).toHaveTextContent("T3");
    expect(deltaRow("$.t3")).toHaveTextContent("Exposure only");
    expect(within(deltaRow("$.t3")).queryByText("Matched T2 pattern")).not.toBeInTheDocument();

    expect(deltaRow("$.unmatched")).toHaveTextContent("Unmatched note");
    expect(within(deltaRow("$.unmatched")).queryByText("T3")).not.toBeInTheDocument();
    expect(
      within(deltaRow("$.unmatched")).queryByText("Matched T2 pattern"),
    ).not.toBeInTheDocument();
  });

  it("links the gate receipt action to a replay-matched claim, not the implicit selection", () => {
    const snapshot = snapshotWithDeltas([delta("T2")]);
    const selected = { ...ledgerRow("T1"), receipt_id: "receipt-for-unrelated-selection" };
    const matched = { ...ledgerRow("T2"), receipt_id: "receipt-for-matched-claim" };
    snapshot.selected = selected;
    snapshot.allLedgerRows = snapshot.allLedgerRows.map((row) =>
      row.claim_id === matched.claim_id ? matched : row,
    );

    render(<GateView snapshot={snapshot} />);

    expect(screen.getByRole("link", { name: "Matched receipt" })).toHaveAttribute(
      "href",
      `/app?view=behavior&entry=${matched.id}`,
    );
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
  const row = screen.getByText(`${path} · shape delta`).closest("article");
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
    permissions: {
      canPinAssertion: true,
      canOverrideClaim: true,
      canManagePolicy: true,
      canManageCorpus: true,
      reason: null,
    },
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
    replayCorpora: [],
    replayReport: {
      id: "77777777-7777-4777-8777-777777777777",
      generated_at: "2026-07-15T08:00:00.000Z",
      base_url: "https://ci.example.test/base",
      candidate_url: "https://ci.example.test/candidate",
      base_image_digest: `sha256:${"a".repeat(64)}`,
      candidate_image_digest: `sha256:${"b".repeat(64)}`,
      extractor_version: "extractors-go-0.4.1",
      corpus_digest: `sha256:${"c".repeat(64)}`,
      fixture_digest: `sha256:${"d".repeat(64)}`,
      mask_digest: `sha256:${"e".repeat(64)}`,
      runner_version: "hyrum-replay-0.4.1",
      policy_id: "88888888-8888-4888-8888-888888888888",
      policy_version: 1,
      runs: 1,
      outcome: "block",
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
