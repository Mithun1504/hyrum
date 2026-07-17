import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  AdvisoryCircuitBreaker,
  AdvisoryModelError,
  digestAdvisoryInput,
  runStructuredAdvisory,
} from "./client";
import { type ReplayImpactPromptInput, validateReplayImpactExplanation } from "./prompts";
import { replayImpactExplanationSchema } from "./schemas";

const output = {
  headline: "One consumer may be affected",
  summary: "A stable response shape changed.",
  affectedConsumers: ["checkout"],
  recommendedActions: ["Review the response shape."],
  uncertainty: 0.1,
  abstained: false,
  abstentionReason: null,
  citations: [
    {
      resourceType: "replay_delta" as const,
      resourceId: "11111111-1111-4111-8111-111111111111",
      role: "supports" as const,
    },
  ],
};

describe("runStructuredAdvisory", () => {
  it("uses a non-stored structured Responses API request", async () => {
    const parse = vi.fn().mockResolvedValue({
      id: "resp_1",
      model: "gpt-5.6-terra-2026-06-01",
      output_parsed: output,
      output: [],
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const client = { responses: { parse } } as unknown as OpenAI;
    const result = await runStructuredAdvisory({
      client,
      schema: replayImpactExplanationSchema,
      schemaName: "replay_impact_explanation",
      instructions: "Use only supplied facts.",
      input: { replayRunId: "run" },
    });

    expect(result.output).toEqual(output);
    expect(result.inputTokens).toBe(10);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5.6-terra", store: false }),
      undefined,
    );
  });

  it("rejects a refusal without exposing prompt content", async () => {
    const client = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          id: "resp_1",
          model: "gpt-5.6-terra",
          output_parsed: null,
          output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }],
        }),
      },
    } as unknown as OpenAI;
    await expect(
      runStructuredAdvisory({
        client,
        schema: replayImpactExplanationSchema,
        schemaName: "replay_impact_explanation",
        instructions: "safe",
        input: { secret: "must-not-appear" },
      }),
    ).rejects.toMatchObject({ code: "refused", message: "The advisory model refused the request" });
  });

  it("opens and resets its circuit after bounded failures", () => {
    const breaker = new AdvisoryCircuitBreaker(2, 100);
    breaker.recordFailure(1_000);
    breaker.recordFailure(1_001);
    expect(() => breaker.assertAvailable(1_050)).toThrowError(AdvisoryModelError);
    expect(() => breaker.assertAvailable(1_102)).not.toThrow();
  });

  it("produces stable digests independent of object key order", () => {
    expect(digestAdvisoryInput({ b: 2, a: 1 })).toBe(digestAdvisoryInput({ a: 1, b: 2 }));
  });

  it("rejects a citation that was not supplied to the model", () => {
    const input: ReplayImpactPromptInput = {
      replayRunId: "11111111-1111-4111-8111-111111111110",
      deterministicDecision: {
        id: "11111111-1111-4111-8111-111111111112",
        outcome: "warn",
        decisionDigest: "a".repeat(64),
      },
      deltas: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          method: "GET",
          pathTemplate: "/users/{id}",
          kind: "shape",
          stability: "stable",
        },
      ],
      impacts: [],
    };
    expect(() =>
      validateReplayImpactExplanation(input, {
        ...output,
        citations: [
          {
            resourceType: "replay_delta",
            resourceId: "11111111-1111-4111-8111-111111111199",
            role: "supports",
          },
        ],
      }),
    ).toThrow("outside the supplied input");
  });
});
