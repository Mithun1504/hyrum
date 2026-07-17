import { openApiPatchOperationSchema } from "@hyrum/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export const OPENAI_SAFETY_BOUNDARY =
  "Model output is advisory and must never decide whether behavior changed or whether a gate blocks.";

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

export interface SpecDraftResult {
  responseId: string;
  model: string;
  promptVersion: "spec-draft-v1";
  tokenUsage: ParsedResponse<unknown>["usage"];
  result: SpecDraft;
}

export function createOpenAIClient(apiKey = process.env.OPENAI_API_KEY): OpenAI {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for model-assisted operations");
  return new OpenAI({ apiKey, timeout: 20_000, maxRetries: 2 });
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
  const response = (await client.responses.parse({
    model,
    store: false,
    reasoning: { effort: "medium" },
    instructions: [
      "Draft an advisory OpenAPI 3.1 change that documents one observed accidental contract.",
      "Use only the supplied redacted evidence and cite receipt IDs exactly.",
      "Do not claim that a behavior changed, decide a gate, invent payload values, or include secrets.",
      "Abstain when the evidence is insufficient to draft a precise schema change.",
    ].join(" "),
    input: JSON.stringify(input),
    text: { format: zodTextFormat(specDraftSchema, "hyrum_spec_draft_v1") },
  })) as ParsedResponse<SpecDraft>;

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
