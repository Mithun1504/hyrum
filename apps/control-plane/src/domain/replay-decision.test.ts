import type { ReplayReport } from "@hyrum/contracts";
import { describe, expect, it } from "vitest";
import {
  type ActiveReplayAssertion,
  type ActiveReplayClaim,
  isEligibleT1Claim,
  recomputeReplayDecision,
} from "./replay-decision";

const organizationId = "00000000-0000-4000-8000-000000000001";
const claimId = "00000000-0000-4000-8000-000000000101";
const behaviorId = "00000000-0000-4000-8000-000000000301";
const consumerId = "00000000-0000-4000-8000-000000000401";
const evaluatedAt = new Date("2026-07-15T00:00:00.000Z");

function claim(overrides: Partial<ActiveReplayClaim> = {}): ActiveReplayClaim {
  return {
    id: claimId,
    organizationId,
    behaviorId,
    behaviorKind: "shape",
    behaviorPath: "$.next_cursor",
    consumerId,
    tier: "T1",
    humanOverrideTier: null,
    state: "active",
    receiptId: "00000000-0000-4000-8000-000000000501",
    receiptOrganizationId: organizationId,
    receiptBehaviorId: behaviorId,
    receiptConsumerId: consumerId,
    receiptSessionId: "00000000-0000-4000-8000-000000000601",
    receiptSequenceStart: 2,
    receiptSequenceEnd: 3,
    receiptExpiresAt: new Date("2026-08-15T00:00:00.000Z"),
    sessionOrganizationId: organizationId,
    sessionConsumerId: consumerId,
    sessionComplete: true,
    ...overrides,
  };
}

function report(result: Partial<ReplayReport["results"][number]> = {}): ReplayReport {
  return {
    version: "2.0.0",
    organization_id: organizationId,
    generated_at: evaluatedAt.toISOString(),
    base_url: "https://base.example.test",
    candidate_url: "https://candidate.example.test",
    base_image_digest: `sha256:${"a".repeat(64)}`,
    candidate_image_digest: `sha256:${"b".repeat(64)}`,
    extractor_version: "extractor-1",
    corpus_digest: `sha256:${"c".repeat(64)}`,
    fixture_digest: `sha256:${"d".repeat(64)}`,
    mask_digest: `sha256:${"e".repeat(64)}`,
    runner_version: "runner-1",
    policy_id: "00000000-0000-4000-8000-000000000091",
    policy_version: 1,
    runs: 2,
    results: [
      {
        case_id: "case-1",
        stable: true,
        quarantined: false,
        deltas: [
          {
            kind: "shape",
            path: "$.next_cursor",
            digest: "sha256:delta",
            matches: [{ claim_id: claimId }],
          },
        ],
        ...result,
      },
    ],
    assertion_results: [],
    signature: { algorithm: "ed25519", key_id: "agent-1", value: "sig" },
  };
}

const policy = { blockTiers: ["T1"] as const, warnTiers: ["T2"] as const };

describe("recomputeReplayDecision", () => {
  it("blocks only a stable T1 match with a complete current exact receipt", () => {
    const decision = recomputeReplayDecision(
      report(),
      organizationId,
      new Map([[claimId, claim()]]),
      new Map(),
      policy,
      evaluatedAt,
    );
    expect(decision).toEqual({
      outcome: "block",
      block_count: 1,
      warn_count: 0,
      note_count: 0,
      reasons: ["1 blocking claim(s) matched stable deltas"],
    });
  });

  it("downgrades incomplete, expired, mismatched, or unordered T1 evidence to warning", () => {
    const invalidClaims = [
      claim({ sessionComplete: false }),
      claim({ receiptExpiresAt: evaluatedAt }),
      claim({ receiptBehaviorId: "00000000-0000-4000-8000-000000000999" }),
      claim({ receiptConsumerId: "00000000-0000-4000-8000-000000000999" }),
      claim({ receiptSequenceStart: 3, receiptSequenceEnd: 3 }),
      claim({ receiptSessionId: null }),
    ];
    for (const invalid of invalidClaims) {
      expect(isEligibleT1Claim(invalid, evaluatedAt)).toBe(false);
      expect(
        recomputeReplayDecision(
          report(),
          organizationId,
          new Map([[claimId, invalid]]),
          new Map(),
          policy,
          evaluatedAt,
        ),
      ).toMatchObject({ outcome: "warn", block_count: 0, warn_count: 1 });
    }
  });

  it("ignores unstable deltas and deduplicates repeated matches", () => {
    for (const result of [{ stable: false }, { quarantined: true }]) {
      expect(
        recomputeReplayDecision(
          report(result),
          organizationId,
          new Map([[claimId, claim()]]),
          new Map(),
          policy,
          evaluatedAt,
        ).outcome,
      ).toBe("pass");
    }
    const repeated = report({
      deltas: [
        { kind: "shape", path: "$.next_cursor", digest: "one", matches: [{ claim_id: claimId }] },
        { kind: "shape", path: "$.next_cursor", digest: "two", matches: [{ claim_id: claimId }] },
      ],
    });
    expect(
      recomputeReplayDecision(
        repeated,
        organizationId,
        new Map([[claimId, claim()]]),
        new Map(),
        policy,
        evaluatedAt,
      ).block_count,
    ).toBe(1);
  });

  it("rejects unknown, cross-tenant, and inactive claims", () => {
    expect(() =>
      recomputeReplayDecision(report(), organizationId, new Map(), new Map(), policy, evaluatedAt),
    ).toThrow(/Unknown replay claim/);
    expect(() =>
      recomputeReplayDecision(
        report(),
        organizationId,
        new Map([[claimId, claim({ organizationId: "00000000-0000-4000-8000-000000000002" })]]),
        new Map(),
        policy,
        evaluatedAt,
      ),
    ).toThrow(/Cross-tenant replay claim/);
    expect(() =>
      recomputeReplayDecision(
        report(),
        organizationId,
        new Map([[claimId, claim({ state: "stale" })]]),
        new Map(),
        policy,
        evaluatedAt,
      ),
    ).toThrow(/Inactive replay claim/);
    expect(() =>
      recomputeReplayDecision(
        report(),
        organizationId,
        new Map([[claimId, claim({ behaviorPath: "$.other" })]]),
        new Map(),
        policy,
        evaluatedAt,
      ),
    ).toThrow(/Mismatched replay claim behavior/);
  });

  it("never lets stored T2 or T3 claims block", () => {
    for (const tier of ["T2", "T3"] as const) {
      const decision = recomputeReplayDecision(
        report(),
        organizationId,
        new Map([[claimId, claim({ tier })]]),
        new Map(),
        { blockTiers: [tier], warnTiers: [tier] },
        evaluatedAt,
      );
      expect(decision.block_count).toBe(0);
    }
  });

  it("requires exact active assertion coverage and blocks failures", () => {
    const assertionId = "00000000-0000-4000-8000-000000000201";
    const assertion: ActiveReplayAssertion = {
      id: assertionId,
      organizationId,
      behaviorId,
      claimId,
    };
    const coverage = {
      assertion_id: assertionId,
      behavior_id: behaviorId,
      claim_id: claimId,
      case_id: "assertion-case",
      outcome: "fail" as const,
    };
    expect(() =>
      recomputeReplayDecision(
        { ...report(), results: [] },
        organizationId,
        new Map(),
        new Map([[assertionId, assertion]]),
        policy,
        evaluatedAt,
      ),
    ).toThrow(/Missing replay assertion coverage/);
    expect(
      recomputeReplayDecision(
        { ...report({ deltas: [] }), assertion_results: [coverage] },
        organizationId,
        new Map(),
        new Map([[assertionId, assertion]]),
        policy,
        evaluatedAt,
      ),
    ).toMatchObject({ outcome: "block", block_count: 1 });
  });
});
