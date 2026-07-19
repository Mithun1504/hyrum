import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LedgerRow, WorkspaceSnapshot } from "@/services/workspace-data";

vi.mock("@/app/(dashboard)/app/actions", () => ({
  addReplayCorpusItemAction: vi.fn(),
  createReplayCorpusAction: vi.fn(),
  pinAssertionAction: vi.fn(),
  resolveAssertionAction: vi.fn(),
  updateReplayCorpusStatusAction: vi.fn(),
}));
vi.mock("@/components/workspace/assertion-pin-form", () => ({
  AssertionPinForm: () => null,
}));
vi.mock("@/components/workspace/spec-draft-form", () => ({
  SpecDraftForm: () => null,
}));
vi.mock("@/components/workspace/assertion-resolution-form", () => ({
  AssertionResolutionForm: () => null,
}));

import { AssertionsView } from "./assertion-replay-views";

describe("AssertionsView", () => {
  it("shows an expired assertion for the selected behavior instead of hiding it", () => {
    const selected = ledgerRow();
    render(
      <AssertionsView
        snapshot={
          {
            apiStatus: "ok",
            dataMode: "live",
            dataErrors: [],
            role: "engineer",
            summary: null,
            permissions: {
              canPinAssertion: true,
              canOverrideClaim: true,
              canManagePolicy: false,
              canManageCorpus: true,
              reason: null,
            },
            filters: { query: "", selectedId: selected.id, tier: "all", kind: "all", state: "all" },
            consumers: [],
            allLedgerRows: [selected],
            ledgerRows: [selected],
            selected,
            receipt: null,
            assertions: [
              {
                id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                behavior_id: selected.behavior_id,
                claim_id: selected.claim_id,
                owner_id: "owner_123456789",
                reason: "Migration review expired.",
                status: "expired",
                expires_at: "2026-07-14T08:00:00.000Z",
                resolution_type: null,
                resolution_reason: null,
                resolved_by: null,
                resolved_at: null,
                customer_notice: null,
              },
            ],
            gatePolicy: null,
            replayCorpora: [],
            replayReport: null,
            progressEvents: [],
            defaultAssertionExpiry: "2026-10-13T08:00:00.000Z",
          } satisfies WorkspaceSnapshot
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Selected assertion" })).toBeVisible();
    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Migration review expired.").length).toBeGreaterThan(0);
  });
});

function ledgerRow(): LedgerRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    claim_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    behavior_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    consumer_id: "11111111-1111-4111-8111-111111111111",
    operation_id: null,
    kind: "shape",
    tier: "T1",
    state: "active",
    title: "Echoed idempotency key",
    last_seen_at: "2026-07-15T08:00:00.000Z",
    freshness_until: "2026-10-13T08:00:00.000Z",
    receipt_id: null,
    endpoint: "POST /v1/orders",
    consumer_alias: "Checkout Web",
    consumer_stable_id: "checkout-web",
    observation_count: 12,
    session_count: 3,
    owner: null,
    receipt_digest: null,
    impact: "Proven echo dependency.",
    evidence_summary: "No active receipt.",
  };
}
