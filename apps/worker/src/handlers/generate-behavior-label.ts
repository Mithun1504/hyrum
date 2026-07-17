import { createHash } from "node:crypto";
import {
  type ClaimedJob,
  completeBehaviorLabelProposal,
  type DatabaseTransaction,
  prepareBehaviorLabelProposal,
} from "@hyrum/db";
import {
  AdvisoryModelError,
  BEHAVIOR_LABEL_INSTRUCTIONS,
  behaviorLabelProposalSchema,
  createOpenAIClient,
  fallbackBehaviorLabelProposal,
  runStructuredAdvisory,
  validateBehaviorLabelProposal,
} from "@hyrum/openai";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({
  llmRunId: z.uuid(),
  behaviorDefinitionId: z.uuid(),
});

export function createGenerateBehaviorLabelHandler(config: {
  apiKey: string | undefined;
}): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Behavior label jobs must be tenant scoped");
    const payload = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const prepared = await prepareBehaviorLabelProposal(
      tx,
      context.organizationId,
      payload.llmRunId,
      payload.behaviorDefinitionId,
    );
    if (!prepared) return;
    let completion: {
      output: z.infer<typeof behaviorLabelProposalSchema>;
      responseId: string | null;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      outputDigest: string;
      fallbackCode?: string;
    };
    try {
      if (!config.apiKey)
        throw new AdvisoryModelError("request_failed", "OpenAI is not configured");
      const result = await runStructuredAdvisory({
        client: createOpenAIClient(config.apiKey),
        schema: behaviorLabelProposalSchema,
        schemaName: "behavior_label_proposal",
        instructions: BEHAVIOR_LABEL_INSTRUCTIONS,
        input: prepared.input,
        model: prepared.model,
        reasoningEffort: "low",
        signal: context.signal,
      });
      completion = {
        ...result,
        responseId: result.responseId,
        output: validateBehaviorLabelProposal(prepared.input.behaviorDefinitionId, result.output),
      };
    } catch (error) {
      const modelError =
        error instanceof AdvisoryModelError
          ? error
          : new AdvisoryModelError("invalid_output", "Behavior label failed validation", {
              cause: error,
            });
      if (
        (modelError.code === "request_failed" || modelError.code === "circuit_open") &&
        job.attempts < job.maxAttempts
      ) {
        throw modelError;
      }
      const output = fallbackBehaviorLabelProposal(prepared.input.defaultLabel, modelError.code);
      completion = {
        output,
        responseId: null,
        model: prepared.model,
        inputTokens: null,
        outputTokens: null,
        outputDigest: createHash("sha256").update(JSON.stringify(output)).digest("hex"),
        fallbackCode: modelError.code,
      };
    }
    await completeBehaviorLabelProposal(tx, context.organizationId, prepared, completion);
  };
}
