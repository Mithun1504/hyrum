import { z } from "zod";

export const advisoryRunSchema = z.object({
  llmRunId: z.uuid(),
  status: z.enum(["queued", "running", "succeeded", "rejected", "failed", "cancelled"]),
});

export const replayImpactExplanationSchema = z.object({
  id: z.uuid(),
  llmRunId: z.uuid(),
  status: z.enum(["draft", "accepted", "rejected", "published"]),
  modelStatus: z.enum(["queued", "running", "succeeded", "rejected", "failed", "cancelled"]),
  model: z.string(),
  headline: z.string(),
  summary: z.string(),
  uncertainty: z.number().min(0).max(1),
  abstained: z.boolean(),
  abstentionReason: z.string().nullable(),
  schemaValid: z.boolean().nullable(),
  outputDigest: z.string().nullable(),
  promptVersion: z.number().int().positive(),
  promptDigest: z.string().regex(/^[0-9a-f]{64}$/),
  schemaDigest: z.string().regex(/^[0-9a-f]{64}$/),
  citations: z.array(
    z.object({
      resourceType: z.enum(["receipt", "dependency_claim", "replay_delta", "behavior_definition"]),
      resourceId: z.uuid(),
      role: z.enum(["supports", "context", "counterexample"]),
    }),
  ),
  createdAt: z.iso.datetime(),
});
export type ReplayImpactExplanation = z.infer<typeof replayImpactExplanationSchema>;

export const replayImpactExplanationResponseSchema = z.object({
  data: replayImpactExplanationSchema.nullable(),
});

export const draftTypeSchema = z.enum(["spec_patch", "customer_notice"]);
export const generatedDraftSchema = z.object({
  id: z.uuid(),
  llmRunId: z.uuid(),
  draftType: draftTypeSchema,
  status: z.enum(["draft", "accepted", "rejected", "published"]),
  modelStatus: z.enum(["queued", "running", "succeeded", "rejected", "failed", "cancelled"]),
  model: z.string(),
  content: z.discriminatedUnion("draftType", [
    z.object({
      draftType: z.literal("spec_patch"),
      title: z.string(),
      rationale: z.string(),
      patch: z.string(),
      format: z.enum(["json_patch", "yaml_fragment"]),
    }),
    z.object({
      draftType: z.literal("customer_notice"),
      subject: z.string(),
      body: z.string(),
      audienceSummary: z.string(),
    }),
  ]),
  uncertainty: z.number().min(0).max(1),
  abstained: z.boolean(),
  abstentionReason: z.string().nullable(),
  schemaValid: z.boolean().nullable(),
  outputDigest: z.string().nullable(),
  promptVersion: z.number().int().positive(),
  citations: z.array(
    z.object({
      resourceType: z.enum(["receipt", "dependency_claim", "behavior_definition"]),
      resourceId: z.uuid(),
      role: z.enum(["supports", "context", "counterexample"]),
    }),
  ),
  createdAt: z.iso.datetime(),
});
export type GeneratedDraft = z.infer<typeof generatedDraftSchema>;
export const generatedDraftResponseSchema = z.object({ data: generatedDraftSchema.nullable() });
export const breakingChangePlanPathParamsSchema = z.strictObject({ planId: z.uuid() });
export const productDraftPathParamsSchema = breakingChangePlanPathParamsSchema.extend({
  draftType: draftTypeSchema,
});
export const generatedDraftPathParamsSchema = z.strictObject({ draftId: z.uuid() });
export const draftReviewRequestSchema = z.strictObject({
  decision: z.enum(["accept", "reject"]),
});

export const behaviorPathParamsSchema = z.strictObject({ behaviorId: z.uuid() });
export const behaviorLabelPathParamsSchema = z.strictObject({ labelId: z.uuid() });
export const behaviorLabelProposalSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  description: z.string().nullable(),
  status: z.enum(["proposed", "active", "rejected", "superseded"]),
  llmRunId: z.uuid(),
  modelStatus: z.enum(["queued", "running", "succeeded", "rejected", "failed", "cancelled"]),
  model: z.string(),
  abstentionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type BehaviorLabelProposal = z.infer<typeof behaviorLabelProposalSchema>;
export const behaviorLabelProposalResponseSchema = z.object({
  data: behaviorLabelProposalSchema.nullable(),
});
export const claimPathParamsSchema = z.strictObject({ claimId: z.uuid() });
export const tierProposalSchema = z.object({
  id: z.uuid(),
  proposedTier: z.enum(["t2", "t3"]),
  confidence: z.string().nullable(),
  status: z.enum(["proposed", "active", "disputed", "dismissed", "stale", "superseded"]),
  llmRunId: z.uuid(),
  modelStatus: z.enum(["queued", "running", "succeeded", "rejected", "failed", "cancelled"]),
  model: z.string(),
  abstentionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type TierProposal = z.infer<typeof tierProposalSchema>;
export const tierProposalResponseSchema = z.object({ data: tierProposalSchema.nullable() });

export const advisoryBatchRequestSchema = z.strictObject({
  behaviorIds: z.array(z.uuid()).max(100),
  claimIds: z.array(z.uuid()).max(100),
});
export const advisoryBatchResponseSchema = z.object({
  labels: z.array(
    z.object({ behaviorDefinitionId: z.uuid(), proposal: behaviorLabelProposalSchema }),
  ),
  tiers: z.array(z.object({ dependencyClaimId: z.uuid(), proposal: tierProposalSchema })),
});
