import { createHash } from "node:crypto";
import {
  type ClaimedJob,
  completeReplayImpactExplanation,
  type DatabaseTransaction,
  prepareReplayImpactExplanation,
} from "@hyrum/db";
import {
  AdvisoryModelError,
  createOpenAIClient,
  fallbackReplayImpactExplanation,
  REPLAY_IMPACT_INSTRUCTIONS,
  replayImpactExplanationSchema,
  runStructuredAdvisory,
  validateReplayImpactExplanation,
} from "@hyrum/openai";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ llmRunId: z.uuid(), replayRunId: z.uuid() });

function tenantSafetyIdentifier(organizationId: string): string {
  return createHash("sha256").update(`hyrum:${organizationId}`).digest("hex");
}

export function createGenerateReplayImpactHandler(config: {
  apiKey: string | undefined;
}): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Advisory jobs must be tenant scoped");
    const payload = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const prepared = await prepareReplayImpactExplanation(
      tx,
      context.organizationId,
      payload.llmRunId,
      payload.replayRunId,
    );
    if (!prepared) return;
    if (context.signal.aborted) throw context.signal.reason;

    try {
      if (!config.apiKey)
        throw new AdvisoryModelError("request_failed", "OpenAI is not configured");
      const completion = await runStructuredAdvisory({
        client: createOpenAIClient(config.apiKey),
        schema: replayImpactExplanationSchema,
        schemaName: "replay_impact_explanation",
        instructions: REPLAY_IMPACT_INSTRUCTIONS,
        input: prepared.input,
        model: prepared.model,
        reasoningEffort: "medium",
        safetyIdentifier: tenantSafetyIdentifier(context.organizationId),
        signal: context.signal,
      });
      const output = validateReplayImpactExplanation(prepared.input, completion.output);
      await completeReplayImpactExplanation(tx, context.organizationId, prepared, {
        output,
        responseId: completion.responseId,
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        outputDigest: completion.outputDigest,
      });
    } catch (error) {
      const modelError =
        error instanceof AdvisoryModelError
          ? error
          : new AdvisoryModelError(
              "invalid_output",
              "Advisory output failed deterministic validation",
              {
                cause: error,
              },
            );
      const retryable = modelError.code === "request_failed" || modelError.code === "circuit_open";
      if (retryable && job.attempts < job.maxAttempts) throw modelError;
      const fallback = fallbackReplayImpactExplanation(prepared.input, modelError.code);
      await completeReplayImpactExplanation(tx, context.organizationId, prepared, {
        output: fallback,
        responseId: null,
        model: prepared.model,
        inputTokens: null,
        outputTokens: null,
        outputDigest: createHash("sha256").update(JSON.stringify(fallback)).digest("hex"),
        fallbackCode: modelError.code,
      });
    }
  };
}
