import { createHash } from "node:crypto";
import {
  type ClaimedJob,
  completeTierProposal,
  type DatabaseTransaction,
  prepareTierProposal,
} from "@hyrum/db";
import {
  AdvisoryModelError,
  createOpenAIClient,
  fallbackTierProposal,
  runStructuredAdvisory,
  TIER_PROPOSAL_INSTRUCTIONS,
  tierProposalSchema,
  validateTierProposal,
} from "@hyrum/openai";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ llmRunId: z.uuid(), dependencyClaimId: z.uuid() });

export function createGenerateTierProposalHandler(config: {
  apiKey: string | undefined;
}): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Tier proposal jobs must be tenant scoped");
    const payload = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const prepared = await prepareTierProposal(
      tx,
      context.organizationId,
      payload.llmRunId,
      payload.dependencyClaimId,
    );
    if (!prepared) return;
    let completion: {
      output: z.infer<typeof tierProposalSchema>;
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
        schema: tierProposalSchema,
        schemaName: "tier_proposal",
        instructions: TIER_PROPOSAL_INSTRUCTIONS,
        input: prepared.input,
        model: prepared.model,
        reasoningEffort: "low",
        signal: context.signal,
      });
      completion = {
        ...result,
        responseId: result.responseId,
        output: validateTierProposal(prepared.input.citationResources, result.output),
      };
    } catch (error) {
      const modelError =
        error instanceof AdvisoryModelError
          ? error
          : new AdvisoryModelError("invalid_output", "Tier proposal failed validation", {
              cause: error,
            });
      if (
        (modelError.code === "request_failed" || modelError.code === "circuit_open") &&
        job.attempts < job.maxAttempts
      ) {
        throw modelError;
      }
      const output = fallbackTierProposal(modelError.code);
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
    await completeTierProposal(tx, context.organizationId, prepared, completion);
  };
}
