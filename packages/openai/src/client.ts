import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

export const OPENAI_SAFETY_BOUNDARY =
  "Model output is advisory and must never decide whether behavior changed or whether a gate blocks.";

export const DEFAULT_ADVISORY_MODEL = "gpt-5.6-terra";
export const HIGH_VALUE_ADVISORY_MODEL = "gpt-5.6";

export class AdvisoryModelError extends Error {
  constructor(
    public readonly code:
      | "circuit_open"
      | "request_failed"
      | "refused"
      | "empty_output"
      | "invalid_output",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AdvisoryModelError";
  }
}

export class AdvisoryCircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetAfterMs = 60_000,
  ) {}

  assertAvailable(now = Date.now()): void {
    if (this.openedAt === null) return;
    if (now - this.openedAt >= this.resetAfterMs) {
      this.failures = 0;
      this.openedAt = null;
      return;
    }
    throw new AdvisoryModelError("circuit_open", "Advisory model circuit is temporarily open");
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = now;
  }
}

export function createOpenAIClient(apiKey = process.env.OPENAI_API_KEY): OpenAI {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for model-assisted operations");
  return new OpenAI({ apiKey, timeout: 20_000, maxRetries: 2 });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestAdvisoryInput(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export interface StructuredAdvisoryOptions<Schema extends z.ZodType> {
  client: OpenAI;
  schema: Schema;
  schemaName: string;
  instructions: string;
  input: unknown;
  model?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  safetyIdentifier?: string;
  circuitBreaker?: AdvisoryCircuitBreaker;
  signal?: AbortSignal;
}

export interface StructuredAdvisoryResult<Output> {
  output: Output;
  responseId: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  inputDigest: string;
  outputDigest: string;
}

export async function runStructuredAdvisory<Schema extends z.ZodType>(
  options: StructuredAdvisoryOptions<Schema>,
): Promise<StructuredAdvisoryResult<z.infer<Schema>>> {
  const breaker = options.circuitBreaker;
  breaker?.assertAvailable();
  const model = options.model ?? DEFAULT_ADVISORY_MODEL;
  const inputDigest = digestAdvisoryInput(options.input);
  try {
    const response = await options.client.responses.parse(
      {
        model,
        store: false,
        instructions: `${OPENAI_SAFETY_BOUNDARY}\n${options.instructions}`,
        input: JSON.stringify(options.input),
        text: { format: zodTextFormat(options.schema, options.schemaName) },
        reasoning: { effort: options.reasoningEffort ?? "low" },
        ...(options.safetyIdentifier ? { safety_identifier: options.safetyIdentifier } : {}),
      },
      options.signal ? { signal: options.signal } : undefined,
    );
    if (response.output_parsed === null) {
      const refused = response.output.some(
        (item) =>
          item.type === "message" && item.content.some((content) => content.type === "refusal"),
      );
      throw new AdvisoryModelError(
        refused ? "refused" : "empty_output",
        refused
          ? "The advisory model refused the request"
          : "The advisory model returned no output",
      );
    }
    const parsed = options.schema.safeParse(response.output_parsed);
    if (!parsed.success) {
      throw new AdvisoryModelError("invalid_output", "The advisory model output failed validation");
    }
    breaker?.recordSuccess();
    return {
      output: parsed.data,
      responseId: response.id,
      model: response.model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      inputDigest,
      outputDigest: digestAdvisoryInput(parsed.data),
    };
  } catch (error) {
    breaker?.recordFailure();
    if (error instanceof AdvisoryModelError) throw error;
    throw new AdvisoryModelError("request_failed", "The advisory model request failed", {
      cause: error,
    });
  }
}
