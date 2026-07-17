import type { EvidenceTier, ReplayReport } from "@hyrum/contracts";

export interface ActiveReplayClaim {
  id: string;
  organizationId: string;
  behaviorId: string;
  behaviorKind: "shape" | "ordering" | "error" | "status";
  behaviorPath: string;
  consumerId: string;
  tier: EvidenceTier;
  humanOverrideTier: EvidenceTier | null;
  state: "active" | "stale" | "dismissed";
  receiptId: string | null;
  receiptOrganizationId: string | null;
  receiptBehaviorId: string | null;
  receiptConsumerId: string | null;
  receiptSessionId: string | null;
  receiptSequenceStart: number | null;
  receiptSequenceEnd: number | null;
  receiptExpiresAt: Date | null;
  sessionOrganizationId: string | null;
  sessionConsumerId: string | null;
  sessionComplete: boolean | null;
}

export interface ActiveReplayAssertion {
  id: string;
  organizationId: string;
  behaviorId: string;
  claimId: string | null;
}

export interface ReplayPolicyInput {
  blockTiers: readonly EvidenceTier[];
  warnTiers: readonly EvidenceTier[];
}

export interface RecomputedReplayDecision {
  outcome: "pass" | "warn" | "block";
  block_count: number;
  warn_count: number;
  note_count: number;
  reasons: string[];
}

export function recomputeReplayDecision(
  report: ReplayReport,
  organizationId: string,
  claimsById: ReadonlyMap<string, ActiveReplayClaim>,
  assertionsById: ReadonlyMap<string, ActiveReplayAssertion>,
  policy: ReplayPolicyInput,
  evaluatedAt: Date,
): RecomputedReplayDecision {
  const blocked = new Set<string>();
  const warned = new Set<string>();
  const noted = new Set<string>();
  const ineligibleT1 = new Set<string>();
  const failedAssertions = new Set<string>();

  for (const result of report.results) {
    for (const delta of result.deltas) {
      for (const match of delta.matches) {
        const claim = claimsById.get(match.claim_id);
        if (!claim) throw new Error(`Unknown replay claim: ${match.claim_id}`);
        if (claim.organizationId !== organizationId) {
          throw new Error(`Cross-tenant replay claim: ${match.claim_id}`);
        }
        if (claim.state !== "active") throw new Error(`Inactive replay claim: ${match.claim_id}`);
        if (claim.behaviorKind !== delta.kind || claim.behaviorPath !== delta.path) {
          throw new Error(`Mismatched replay claim behavior: ${match.claim_id}`);
        }
        if (!result.stable || result.quarantined) continue;
        const tier = claim.humanOverrideTier ?? claim.tier;
        if (tier === "T1" && policy.blockTiers.includes("T1")) {
          if (isEligibleT1Claim(claim, evaluatedAt)) blocked.add(claim.id);
          else {
            warned.add(claim.id);
            ineligibleT1.add(claim.id);
          }
        } else if (policy.warnTiers.includes(tier)) warned.add(claim.id);
        else noted.add(claim.id);
      }
    }
  }

  const coveredAssertions = new Set<string>();
  for (const result of report.assertion_results) {
    const assertion = assertionsById.get(result.assertion_id);
    if (!assertion) throw new Error(`Unknown or inactive replay assertion: ${result.assertion_id}`);
    if (coveredAssertions.has(assertion.id)) {
      throw new Error(`Duplicate replay assertion coverage: ${assertion.id}`);
    }
    if (assertion.organizationId !== organizationId) {
      throw new Error(`Cross-tenant replay assertion: ${assertion.id}`);
    }
    if (assertion.behaviorId !== result.behavior_id || assertion.claimId !== result.claim_id) {
      throw new Error(`Mismatched replay assertion identity: ${assertion.id}`);
    }
    coveredAssertions.add(assertion.id);
    if (result.outcome === "fail") failedAssertions.add(assertion.id);
  }
  for (const assertionId of assertionsById.keys()) {
    if (!coveredAssertions.has(assertionId)) {
      throw new Error(`Missing replay assertion coverage: ${assertionId}`);
    }
  }

  const decision = {
    outcome: blocked.size + failedAssertions.size > 0 ? "block" : warned.size > 0 ? "warn" : "pass",
    block_count: blocked.size + failedAssertions.size,
    warn_count: warned.size,
    note_count: noted.size,
    reasons: [
      ...(blocked.size > 0 ? [`${blocked.size} blocking claim(s) matched stable deltas`] : []),
      ...(failedAssertions.size > 0
        ? [`${failedAssertions.size} pinned assertion(s) failed replay`]
        : []),
      ...(ineligibleT1.size > 0
        ? [
            `${ineligibleT1.size} T1 claim(s) lacked complete current echo receipts and could not block`,
          ]
        : []),
      ...(warned.size > 0 ? [`${warned.size} warning claim(s) matched stable deltas`] : []),
      ...(noted.size > 0 ? [`${noted.size} note-only claim(s) matched stable deltas`] : []),
    ],
  } satisfies RecomputedReplayDecision;
  return decision;
}

export function isEligibleT1Claim(claim: ActiveReplayClaim, evaluatedAt: Date) {
  return (
    claim.tier === "T1" &&
    claim.humanOverrideTier !== "T2" &&
    claim.humanOverrideTier !== "T3" &&
    claim.receiptId !== null &&
    claim.receiptOrganizationId === claim.organizationId &&
    claim.receiptBehaviorId === claim.behaviorId &&
    claim.receiptConsumerId === claim.consumerId &&
    claim.receiptSessionId !== null &&
    claim.receiptSequenceStart !== null &&
    claim.receiptSequenceEnd !== null &&
    claim.receiptSequenceEnd > claim.receiptSequenceStart &&
    claim.receiptExpiresAt !== null &&
    claim.receiptExpiresAt > evaluatedAt &&
    claim.sessionOrganizationId === claim.organizationId &&
    claim.sessionConsumerId === claim.consumerId &&
    claim.sessionComplete === true
  );
}
