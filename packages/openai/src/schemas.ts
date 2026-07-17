import { z } from "zod";

const citationSchema = z.strictObject({
  resourceType: z.enum(["receipt", "dependency_claim", "replay_delta", "behavior_definition"]),
  resourceId: z.uuid(),
  role: z.enum(["supports", "context", "counterexample"]),
});

const advisoryEnvelope = {
  uncertainty: z.number().min(0).max(1),
  abstained: z.boolean(),
  abstentionReason: z.string().max(500).nullable(),
  citations: z.array(citationSchema).max(100),
};

export const replayImpactExplanationSchema = z.strictObject({
  headline: z.string().min(1).max(160),
  summary: z.string().min(1).max(4_000),
  affectedConsumers: z.array(z.string().min(1).max(200)).max(100),
  recommendedActions: z.array(z.string().min(1).max(500)).max(20),
  ...advisoryEnvelope,
});

export const behaviorLabelProposalSchema = z.strictObject({
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(1_000),
  clusterLabel: z.string().min(1).max(120).nullable(),
  ...advisoryEnvelope,
});

export const tierProposalSchema = z.strictObject({
  // T1 is intentionally impossible here. Only deterministic echo evidence can create T1.
  proposedTier: z.enum(["t2", "t3"]),
  rationale: z.string().min(1).max(2_000),
  ...advisoryEnvelope,
});

export const specPatchDraftSchema = z.strictObject({
  title: z.string().min(1).max(160),
  rationale: z.string().min(1).max(2_000),
  patch: z.string().min(1).max(100_000),
  format: z.enum(["json_patch", "yaml_fragment"]),
  ...advisoryEnvelope,
});

export const customerNoticeDraftSchema = z.strictObject({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  audienceSummary: z.string().min(1).max(1_000),
  ...advisoryEnvelope,
});

export type AdvisoryCitation = z.infer<typeof citationSchema>;
export type ReplayImpactExplanation = z.infer<typeof replayImpactExplanationSchema>;
export type BehaviorLabelProposal = z.infer<typeof behaviorLabelProposalSchema>;
export type TierProposal = z.infer<typeof tierProposalSchema>;
export type SpecPatchDraft = z.infer<typeof specPatchDraftSchema>;
export type CustomerNoticeDraft = z.infer<typeof customerNoticeDraftSchema>;

export const advisoryModelResultSchema = replayImpactExplanationSchema;
