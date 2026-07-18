import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/assertion-replay-views", () => ({
  AssertionsView: () => null,
  ReplayView: () => null,
}));
vi.mock("@/components/workspace/behavior-gate-views", () => ({
  BehaviorView: () => null,
  GateView: () => null,
}));
vi.mock("@/components/workspace/capture-ledger-views", () => ({
  CaptureView: () => null,
  LedgerView: () => null,
}));
vi.mock("@/components/workspace/coverage-views", () => ({
  ConsumersView: () => null,
  EndpointsView: () => null,
  PolicyView: () => null,
}));
vi.mock("@/components/workspace/overview-view", () => ({
  OverviewView: () => null,
}));
vi.mock("@/components/workspace/workspace-navigation", () => ({
  WorkspaceNavigation: () => null,
}));
vi.mock("@/components/workspace/workspace-primitives", () => ({
  DataStatusBanner: () => null,
}));

import { normalizeView } from "./workspace-shell";

describe("normalizeView", () => {
  it("defaults missing and unknown views to overview", () => {
    expect(normalizeView(undefined)).toBe("overview");
    expect(normalizeView("dashboard")).toBe("overview");
  });

  it("keeps supported primary and contextual views", () => {
    expect(normalizeView("ledger")).toBe("ledger");
    expect(normalizeView("behavior")).toBe("behavior");
  });
});
