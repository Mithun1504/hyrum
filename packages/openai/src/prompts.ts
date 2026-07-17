import { createHash } from "node:crypto";
import { z } from "zod";
import { digestAdvisoryInput } from "./client";
import {
  type BehaviorLabelProposal,
  behaviorLabelProposalSchema,
  type CustomerNoticeDraft,
  customerNoticeDraftSchema,
  type ReplayImpactExplanation,
  replayImpactExplanationSchema,
  type SpecPatchDraft,
  specPatchDraftSchema,
  type TierProposal,
  tierProposalSchema,
} from "./schemas";

export const REPLAY_IMPACT_PROMPT_VERSION = 1;
export const REPLAY_IMPACT_TASK = "replay_impact_explanation";

export interface ReplayImpactPromptInput {
  replayRunId: string;
  deterministicDecision: {
    id: string;
    outcome: "block" | "warn" | "note" | "pass";
    decisionDigest: string;
  };
  deltas: Array<{
    id: string;
    method: string;
    pathTemplate: string;
    kind: "shape" | "ordering" | "error_template";
    stability: "stable" | "flaky";
  }>;
  impacts: Array<{
    replayDeltaId: string;
    consumerAlias: string;
    action: "block" | "warn" | "note" | "pass";
    reasonCode: string;
    effectiveTier: "t1" | "t2" | "t3" | null;
    receiptId: string | null;
    dependencyClaimId: string | null;
    assertionId: string | null;
  }>;
}

export const REPLAY_IMPACT_INSTRUCTIONS = `Explain the persisted deterministic replay result for a developer.
Use only the supplied facts. Cite resource IDs from the input for every material claim.
Do not infer a different outcome, evidence tier, consumer, or changed behavior.
Treat flaky deltas as uncertain. If the evidence is insufficient, abstain.
Return plain text only in text fields; do not emit Markdown links or HTML.`;

export const REPLAY_IMPACT_PROMPT_DIGEST = createHash("sha256")
  .update(REPLAY_IMPACT_INSTRUCTIONS)
  .digest("hex");
export const REPLAY_IMPACT_SCHEMA_DIGEST = digestAdvisoryInput(
  z.toJSONSchema(replayImpactExplanationSchema, { target: "draft-7" }),
);

export const SPEC_PATCH_PROMPT_VERSION = 1;
export const SPEC_PATCH_TASK = "spec_patch_draft";
export const SPEC_PATCH_INSTRUCTIONS = `Draft a minimal OpenAPI patch for a human to review and apply.
Use only the supplied operation contract and deterministic behavior facts. Never claim the patch has
been applied. Prefer RFC 6902 JSON Patch and cite the behavior or evidence IDs supporting each material
addition. Do not include secrets, links, HTML, or prose outside the structured fields. Abstain when the
facts do not identify a safe contract addition.`;
export const SPEC_PATCH_PROMPT_DIGEST = createHash("sha256")
  .update(SPEC_PATCH_INSTRUCTIONS)
  .digest("hex");
export const SPEC_PATCH_SCHEMA_DIGEST = digestAdvisoryInput(
  z.toJSONSchema(specPatchDraftSchema, { target: "draft-7" }),
);

export const CUSTOMER_NOTICE_PROMPT_VERSION = 1;
export const CUSTOMER_NOTICE_TASK = "customer_notice_draft";
export const CUSTOMER_NOTICE_INSTRUCTIONS = `Draft a concise customer-facing compatibility notice for
the supplied scheduled change. Use only supplied deterministic facts. State the planned date, affected
behavior, and migration action without inventing contacts, deadlines, URLs, or guarantees. Cite exact
behavior, dependency-claim, or receipt IDs for material claims. Do not output HTML or Markdown links.
Abstain when the facts are insufficient.`;
export const CUSTOMER_NOTICE_PROMPT_DIGEST = createHash("sha256")
  .update(CUSTOMER_NOTICE_INSTRUCTIONS)
  .digest("hex");
export const CUSTOMER_NOTICE_SCHEMA_DIGEST = digestAdvisoryInput(
  z.toJSONSchema(customerNoticeDraftSchema, { target: "draft-7" }),
);

export const BEHAVIOR_LABEL_PROMPT_VERSION = 1;
export const BEHAVIOR_LABEL_TASK = "behavior_label_proposal";
export const BEHAVIOR_LABEL_INSTRUCTIONS = `Propose a concise developer-facing name and description
for one deterministic API behavior. Use only the supplied operation identity, behavior kind, canonical
fingerprint, and declaration classification. A label is advisory and cannot change behavior identity,
evidence tier, or gate policy. Cite the supplied behavior_definition ID. Use a cluster label only when
it improves navigation. Do not include secrets, values, links, Markdown, or HTML. Abstain if the
structural facts are insufficient.`;
export const BEHAVIOR_LABEL_PROMPT_DIGEST = createHash("sha256")
  .update(BEHAVIOR_LABEL_INSTRUCTIONS)
  .digest("hex");
export const BEHAVIOR_LABEL_SCHEMA_DIGEST = digestAdvisoryInput(
  z.toJSONSchema(behaviorLabelProposalSchema, { target: "draft-7" }),
);

export const TIER_PROPOSAL_PROMPT_VERSION = 1;
export const TIER_PROPOSAL_TASK = "tier_proposal";
export const TIER_PROPOSAL_INSTRUCTIONS = `Propose T2 pattern evidence or T3 exposure for a single
consumer and deterministic behavior. T1 is impossible for this task and may only be established by
the deterministic echo extractor. Use only supplied aggregate metrics and cited receipt IDs. Do not
infer client code, business intent, or blocking authority. Prefer T3 when evidence is ambiguous and
abstain when no supported proposal is possible. Do not include secrets, links, Markdown, or HTML.`;
export const TIER_PROPOSAL_PROMPT_DIGEST = createHash("sha256")
  .update(TIER_PROPOSAL_INSTRUCTIONS)
  .digest("hex");
export const TIER_PROPOSAL_SCHEMA_DIGEST = digestAdvisoryInput(
  z.toJSONSchema(tierProposalSchema, { target: "draft-7" }),
);

export function validateBehaviorLabelProposal(
  behaviorDefinitionId: string,
  output: BehaviorLabelProposal,
): BehaviorLabelProposal {
  const allowed = `behavior_definition:${behaviorDefinitionId}`;
  if (
    output.citations.some(
      (citation) => `${citation.resourceType}:${citation.resourceId}` !== allowed,
    )
  ) {
    throw new AdvisoryCitationError("Behavior label cited a resource outside its minimized input");
  }
  if (!output.abstained && !output.citations.some(({ role }) => role === "supports")) {
    throw new AdvisoryCitationError(
      "A non-abstaining behavior label requires a supporting citation",
    );
  }
  return output;
}

export function validateTierProposal(
  input: DraftCitationInput,
  output: TierProposal,
): TierProposal {
  validateDraftCitations(input, output);
  if (!output.abstained && !output.citations.some(({ role }) => role === "supports")) {
    throw new AdvisoryCitationError("A non-abstaining tier proposal requires supporting evidence");
  }
  return output;
}

export function fallbackBehaviorLabelProposal(
  defaultLabel: string,
  reason: string,
): BehaviorLabelProposal {
  return {
    label: defaultLabel,
    description: "Deterministic fallback label; model-assisted naming was unavailable.",
    clusterLabel: null,
    uncertainty: 1,
    abstained: true,
    abstentionReason: reason,
    citations: [],
  };
}

export function fallbackTierProposal(reason: string): TierProposal {
  return {
    proposedTier: "t3",
    rationale: "No model-supported dependency tier was available; retain exposure-only handling.",
    uncertainty: 1,
    abstained: true,
    abstentionReason: reason,
    citations: [],
  };
}

export type DraftCitationInput = {
  behaviorDefinitionIds: string[];
  dependencyClaimIds: string[];
  receiptIds: string[];
};

function validateDraftCitations<
  T extends {
    abstained: boolean;
    citations: Array<{
      resourceType: "receipt" | "dependency_claim" | "replay_delta" | "behavior_definition";
      resourceId: string;
      role: "supports" | "context" | "counterexample";
    }>;
  },
>(input: DraftCitationInput, output: T): T {
  const allowed = new Set([
    ...input.behaviorDefinitionIds.map((id) => `behavior_definition:${id}`),
    ...input.dependencyClaimIds.map((id) => `dependency_claim:${id}`),
    ...input.receiptIds.map((id) => `receipt:${id}`),
  ]);
  for (const citation of output.citations) {
    if (!allowed.has(`${citation.resourceType}:${citation.resourceId}`)) {
      throw new AdvisoryCitationError("Draft cited a resource outside its minimized input");
    }
  }
  if (!output.abstained && output.citations.length === 0) {
    throw new AdvisoryCitationError("A non-abstaining draft must cite deterministic evidence");
  }
  return output;
}

export function validateSpecPatchDraft(
  input: DraftCitationInput,
  output: SpecPatchDraft,
): SpecPatchDraft {
  validateDraftCitations(input, output);
  if (output.abstained) return output;
  if (output.format === "json_patch") {
    let patch: unknown;
    try {
      patch = JSON.parse(output.patch);
    } catch {
      throw new AdvisoryCitationError("Generated JSON Patch is not valid JSON");
    }
    if (!Array.isArray(patch) || patch.length === 0 || patch.length > 100) {
      throw new AdvisoryCitationError("Generated JSON Patch must contain 1–100 operations");
    }
    for (const operation of patch) {
      if (
        operation === null ||
        typeof operation !== "object" ||
        (operation as { op?: unknown }).op !== "add" ||
        typeof (operation as { path?: unknown }).path !== "string" ||
        !(operation as { path: string }).path.startsWith("/")
      ) {
        throw new AdvisoryCitationError(
          "Generated JSON Patch may only contain absolute add operations",
        );
      }
    }
  }
  return output;
}

export function validateCustomerNoticeDraft(
  input: DraftCitationInput,
  output: CustomerNoticeDraft,
): CustomerNoticeDraft {
  validateDraftCitations(input, output);
  if (/https?:\/\//i.test(`${output.subject}\n${output.body}`)) {
    throw new AdvisoryCitationError("Generated notice contains an untrusted link");
  }
  return output;
}

export function fallbackSpecPatchDraft(reason: string): SpecPatchDraft {
  return {
    title: "OpenAPI patch requires manual review",
    rationale: "A safe patch could not be generated. Review the deterministic behavior evidence.",
    patch: "[]",
    format: "json_patch",
    uncertainty: 1,
    abstained: true,
    abstentionReason: reason,
    citations: [],
  };
}

export function fallbackCustomerNoticeDraft(reason: string): CustomerNoticeDraft {
  return {
    subject: "Compatibility change requires manual review",
    body: "A customer notice could not be generated. Review the scheduled change and its deterministic evidence before communicating.",
    audienceSummary: "Audience must be confirmed from the persisted impact list.",
    uncertainty: 1,
    abstained: true,
    abstentionReason: reason,
    citations: [],
  };
}

export function fallbackReplayImpactExplanation(
  input: ReplayImpactPromptInput,
  reason: string,
): ReplayImpactExplanation {
  const affectedConsumers = [...new Set(input.impacts.map(({ consumerAlias }) => consumerAlias))];
  return {
    headline: `Replay gate: ${input.deterministicDecision.outcome}`,
    summary: `The deterministic replay gate completed with outcome ${input.deterministicDecision.outcome}. Review the persisted deltas and impacts for details.`,
    affectedConsumers,
    recommendedActions: ["Review the deterministic replay deltas and cited evidence."],
    uncertainty: 1,
    abstained: true,
    abstentionReason: reason,
    citations: input.deltas.slice(0, 100).map(({ id }) => ({
      resourceType: "replay_delta" as const,
      resourceId: id,
      role: "context" as const,
    })),
  };
}

export class AdvisoryCitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvisoryCitationError";
  }
}

/** Reject citations that do not resolve to an exact, minimized input resource. */
export function validateReplayImpactExplanation(
  input: ReplayImpactPromptInput,
  output: ReplayImpactExplanation,
): ReplayImpactExplanation {
  const resources = new Set<string>();
  for (const delta of input.deltas) resources.add(`replay_delta:${delta.id}`);
  for (const impact of input.impacts) {
    if (impact.receiptId) resources.add(`receipt:${impact.receiptId}`);
    if (impact.dependencyClaimId) resources.add(`dependency_claim:${impact.dependencyClaimId}`);
  }
  const seen = new Set<string>();
  for (const citation of output.citations) {
    const key = `${citation.resourceType}:${citation.resourceId}`;
    if (!resources.has(key)) {
      throw new AdvisoryCitationError("The model cited a resource outside the supplied input");
    }
    if (seen.has(key)) throw new AdvisoryCitationError("The model returned a duplicate citation");
    seen.add(key);
  }
  if (output.abstained && !output.abstentionReason) {
    throw new AdvisoryCitationError("An abstained result must include a reason");
  }
  if (!output.abstained && output.abstentionReason) {
    throw new AdvisoryCitationError("A non-abstained result cannot include an abstention reason");
  }
  if (!output.abstained && output.citations.length === 0) {
    throw new AdvisoryCitationError("A non-abstained result must cite persisted evidence");
  }
  return output;
}
