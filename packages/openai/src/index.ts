import OpenAI from "openai";
import { z } from "zod";

export const advisoryModelResultSchema = z.object({
  summary: z.string(),
  receiptIds: z.array(z.string()),
  uncertainty: z.number().min(0).max(1),
  abstained: z.boolean(),
  abstentionReason: z.string().optional(),
});

export const OPENAI_SAFETY_BOUNDARY =
  "Model output is advisory and must never decide whether behavior changed or whether a gate blocks.";

export function createOpenAIClient(apiKey = process.env.OPENAI_API_KEY): OpenAI {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for model-assisted operations");
  return new OpenAI({ apiKey, timeout: 20_000, maxRetries: 2 });
}
