import { describe, expect, it } from "vitest";
import { actionForGateTarget } from "./gate-decisions";

const policy = {
  t1Action: "block" as const,
  t2Action: "warn" as const,
  t3Action: "pass" as const,
  assertionAction: "block" as const,
  flakyAction: "warn" as const,
};

describe("deterministic gate actions", () => {
  it("only blocks stable eligible T1 evidence and active assertions", () => {
    expect(
      actionForGateTarget({
        stability: "stable",
        tier: "t1",
        assertion: false,
        t1Eligible: true,
        policy,
      }),
    ).toEqual({ action: "block", reasonCode: "eligible_t1_echo" });
    expect(
      actionForGateTarget({ stability: "stable", tier: null, assertion: true, policy }),
    ).toEqual({ action: "block", reasonCode: "active_assertion" });
    expect(
      actionForGateTarget({
        stability: "stable",
        tier: "t1",
        assertion: false,
        t1Eligible: false,
        policy,
      }),
    ).toEqual({ action: "warn", reasonCode: "t1_evidence_ineligible" });
  });

  it("keeps T2 warning-only, T3 non-blocking, and flaky deltas warning-only", () => {
    expect(
      actionForGateTarget({ stability: "stable", tier: "t2", assertion: false, policy }),
    ).toEqual({ action: "warn", reasonCode: "t2_pattern" });
    expect(
      actionForGateTarget({ stability: "stable", tier: "t3", assertion: false, policy }),
    ).toEqual({ action: "pass", reasonCode: "t3_exposure" });
    expect(
      actionForGateTarget({
        stability: "flaky",
        tier: "t1",
        assertion: false,
        t1Eligible: true,
        policy,
      }),
    ).toEqual({ action: "warn", reasonCode: "flaky_delta" });
  });
});
