import { openApiPatchOperationSchema } from "@hyrum/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export const OPENAI_SAFETY_BOUNDARY =
  "Model output is advisory and must never decide whether behavior changed or whether a gate blocks.";
const MODEL_REQUEST_TIMEOUT_MS = 12_000;

async function withModelTimeout<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS);
  return Promise.race([
    request(signal),
    new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error("OpenAI request timed out")), {
        once: true,
      }),
    ),
  ]);
}

export const advisoryModelResultSchema = z
  .object({
    summary: z.string().min(1).max(2_000),
    receiptIds: z.array(z.string().min(1)).max(100),
    uncertainty: z.number().min(0).max(1),
    abstained: z.boolean(),
    abstentionReason: z.string().min(1).max(500).nullable(),
  })
  .strict()
  .refine((result) => result.abstained === (result.abstentionReason !== null), {
    message: "abstentionReason must be present if and only if abstained is true",
  });

export const specDraftSchema = advisoryModelResultSchema
  .extend({
    title: z.string().min(1).max(120),
    rationale: z.string().min(1).max(2_000),
    openapiPatch: z.array(openApiPatchOperationSchema).max(20),
  })
  .strict();
export type SpecDraft = z.infer<typeof specDraftSchema>;

export interface SpecDraftInput {
  method: string;
  path: string;
  behaviorKind: "shape" | "ordering" | "error" | "status";
  behaviorPath: string;
  description: string;
  receiptIds: string[];
  redactedEvidence: string[];
}

interface ParsedResponse<T> {
  id: string;
  model: string;
  output_parsed: T | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export const behaviorClusterResultSchema = advisoryModelResultSchema
  .extend({
    clusters: z.array(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().min(1).max(500),
        behaviorIds: z.array(z.string().min(1)).min(1),
      }),
    ),
  })
  .strict();
export const tierProposalResultSchema = advisoryModelResultSchema
  .extend({
    proposals: z.array(
      z.object({
        claimId: z.string().min(1),
        tier: z.enum(["T1", "T2", "T3"]),
        rationale: z.string().min(1).max(500),
        receiptIds: z.array(z.string().min(1)),
      }),
    ),
  })
  .strict();
export const replayPriorityResultSchema = advisoryModelResultSchema
  .extend({
    priorities: z.array(
      z.object({
        caseId: z.string().min(1),
        rank: z.number().int().positive(),
        reason: z.string().min(1).max(500),
      }),
    ),
  })
  .strict();
export const impactExplanationResultSchema = advisoryModelResultSchema
  .extend({
    explanations: z.array(
      z.object({
        consumerId: z.string().min(1),
        impact: z.string().min(1).max(1_000),
        receiptIds: z.array(z.string().min(1)),
      }),
    ),
  })
  .strict();
export const customerNoticeResultSchema = advisoryModelResultSchema
  .extend({
    subject: z.string().min(1).max(120),
    body: z.string().min(1).max(4_000),
    effectiveAt: z.string().datetime(),
  })
  .strict();

export type BehaviorClusterResult = z.infer<typeof behaviorClusterResultSchema>;
export type TierProposalResult = z.infer<typeof tierProposalResultSchema>;
export type ReplayPriorityResult = z.infer<typeof replayPriorityResultSchema>;
export type ImpactExplanationResult = z.infer<typeof impactExplanationResultSchema>;
export type CustomerNoticeResult = z.infer<typeof customerNoticeResultSchema>;

export type AdvisoryInput = {
  receiptIds: string[];
  redactedEvidence: unknown;
};

type AdvisoryRun<T> = {
  responseId: string;
  model: string;
  promptVersion: string;
  tokenUsage: ParsedResponse<unknown>["usage"];
  result: T;
};

async function runAdvisory<T>(options: {
  input: AdvisoryInput & Record<string, unknown>;
  schema: z.ZodType<T>;
  formatName: string;
  promptVersion: string;
  instructions: string;
  client?: OpenAI;
  model?: string;
}): Promise<AdvisoryRun<T>> {
  if (options.input.receiptIds.length === 0)
    throw new Error("At least one cited receipt is required");
  const client = options.client ?? createOpenAIClient();
  const response = (await withModelTimeout((signal) =>
    client.responses.parse(
      {
        model: options.model ?? "gpt-5.6",
        store: false,
        reasoning: { effort: "low" },
        instructions: `${OPENAI_SAFETY_BOUNDARY} Use only supplied redacted evidence. Cite receipt IDs exactly. Abstain when evidence is insufficient. ${options.instructions}`,
        input: JSON.stringify(options.input),
        text: { format: zodTextFormat(options.schema, options.formatName) },
      },
      { signal },
    ),
  )) as ParsedResponse<T>;
  if (!response.output_parsed) throw new Error("OpenAI returned no structured advisory result");
  const result = options.schema.parse(response.output_parsed);
  validateReceiptCitations(result, options.input.receiptIds);
  return {
    responseId: response.id,
    model: response.model,
    promptVersion: options.promptVersion,
    tokenUsage: response.usage,
    result,
  };
}

function validateReceiptCitations(value: unknown, allowed: string[]) {
  const allowedSet = new Set(allowed);
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (key === "receiptIds" && Array.isArray(child)) {
        if (child.some((id) => typeof id !== "string" || !allowedSet.has(id)))
          throw new Error("Advisory output cited a receipt that was not supplied");
      } else visit(child);
    }
  };
  visit(value);
}

export function clusterAndNameBehaviors(
  input: AdvisoryInput & { behaviors: unknown[] },
  options: { client?: OpenAI; model?: string } = {},
) {
  return runAdvisory({
    input,
    schema: behaviorClusterResultSchema,
    formatName: "hyrum_behavior_clusters_v1",
    promptVersion: "behavior-clusters-v1",
    instructions:
      "Cluster semantically similar observed behaviors and give each cluster a concise neutral name.",
    ...options,
  });
}

export async function proposeEvidenceTiers(
  input: AdvisoryInput & { claims: Array<{ claimId: string; echoEligible: boolean }> },
  options: { client?: OpenAI; model?: string } = {},
) {
  const run = await runAdvisory({
    input,
    schema: tierProposalResultSchema,
    formatName: "hyrum_tier_proposals_v1",
    promptVersion: "tier-proposals-v1",
    instructions:
      "Propose evidence tiers. T1 is allowed only for claims marked echoEligible; proposals never change stored tiers.",
    ...options,
  });
  const eligibility = new Map(input.claims.map((claim) => [claim.claimId, claim.echoEligible]));
  if (
    run.result.proposals.some(
      (proposal) => proposal.tier === "T1" && eligibility.get(proposal.claimId) !== true,
    )
  ) {
    throw new Error("A T1 proposal lacked deterministic echo eligibility");
  }
  return run;
}

export function prioritizeReplayCorpus(
  input: AdvisoryInput & { cases: unknown[] },
  options: { client?: OpenAI; model?: string } = {},
) {
  return runAdvisory({
    input,
    schema: replayPriorityResultSchema,
    formatName: "hyrum_replay_priority_v1",
    promptVersion: "replay-priority-v1",
    instructions: "Rank replay cases for execution; do not remove cases or decide gate outcomes.",
    ...options,
  });
}

export function explainConsumerImpact(
  input: AdvisoryInput & { consumers: unknown[] },
  options: { client?: OpenAI; model?: string } = {},
) {
  return runAdvisory({
    input,
    schema: impactExplanationResultSchema,
    formatName: "hyrum_impact_explanation_v1",
    promptVersion: "impact-explanation-v1",
    instructions:
      "Explain the likely consumer impact of supplied deterministic observations without inventing usage.",
    ...options,
  });
}

export function draftCustomerNotice(
  input: AdvisoryInput & { change: unknown; effectiveAt: string },
  options: { client?: OpenAI; model?: string } = {},
) {
  return runAdvisory({
    input,
    schema: customerNoticeResultSchema,
    formatName: "hyrum_customer_notice_v1",
    promptVersion: "customer-notice-v1",
    instructions:
      "Draft a precise customer notice for the scheduled change. Do not expose receipt contents or identifiers.",
    ...options,
  });
}

export interface SpecDraftResult {
  responseId: string;
  model: string;
  promptVersion: "spec-draft-v1";
  tokenUsage: ParsedResponse<unknown>["usage"];
  result: SpecDraft;
}

export function createOpenAIClient(apiKey = process.env.OPENAI_API_KEY): OpenAI {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for model-assisted operations");
  return new OpenAI({ apiKey, timeout: MODEL_REQUEST_TIMEOUT_MS, maxRetries: 0 });
}

export async function draftOpenApiChange(
  input: SpecDraftInput,
  options: {
    client?: OpenAI;
    model?: string;
  } = {},
): Promise<SpecDraftResult> {
  if (input.receiptIds.length === 0) throw new Error("At least one cited receipt is required");
  if (input.redactedEvidence.length === 0) throw new Error("Redacted evidence is required");
  const client = options.client ?? createOpenAIClient();
  const model = options.model ?? "gpt-5.6";
  const response = (await withModelTimeout((signal) =>
    client.responses.parse(
      {
        model,
        store: false,
        reasoning: { effort: "low" },
        instructions: [
          "Draft an advisory OpenAPI 3.1 change that documents one observed accidental contract.",
          "Use only the supplied redacted evidence and cite receipt IDs exactly.",
          "Do not claim that a behavior changed, decide a gate, invent payload values, or include secrets.",
          "Abstain when the evidence is insufficient to draft a precise schema change.",
        ].join(" "),
        input: JSON.stringify(input),
        text: { format: zodTextFormat(specDraftSchema, "hyrum_spec_draft_v1") },
      },
      { signal },
    ),
  )) as ParsedResponse<SpecDraft>;

  if (!response.output_parsed) throw new Error("OpenAI returned no structured spec draft");
  const result = specDraftSchema.parse(response.output_parsed);
  const allowedReceipts = new Set(input.receiptIds);
  if (result.receiptIds.some((id) => !allowedReceipts.has(id))) {
    throw new Error("Spec draft cited a receipt that was not supplied");
  }
  if (!result.abstained && result.receiptIds.length === 0) {
    throw new Error("A non-abstaining spec draft must cite evidence");
  }

  return {
    responseId: response.id,
    model: response.model,
    promptVersion: "spec-draft-v1",
    tokenUsage: response.usage,
    result,
  };
}

export function deterministicSpecDraftFallback(input: SpecDraftInput): SpecDraft {
  return {
    title: `Document ${input.behaviorPath}`,
    summary: `Document the observed ${input.behaviorKind} behavior for ${input.method.toUpperCase()} ${input.path}.`,
    rationale: input.description,
    receiptIds: input.receiptIds,
    uncertainty: 1,
    abstained: true,
    abstentionReason: "Model-assisted drafting is unavailable; no generated patch was accepted.",
    openapiPatch: [],
  };
}
