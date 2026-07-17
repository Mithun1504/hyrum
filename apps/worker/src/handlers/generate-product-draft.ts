import { createHash } from "node:crypto";
import {
  type ClaimedJob,
  completeProductDraft,
  type DatabaseTransaction,
  prepareProductDraft,
} from "@hyrum/db";
import {
  AdvisoryModelError,
  CUSTOMER_NOTICE_INSTRUCTIONS,
  createOpenAIClient,
  customerNoticeDraftSchema,
  fallbackCustomerNoticeDraft,
  fallbackSpecPatchDraft,
  runStructuredAdvisory,
  SPEC_PATCH_INSTRUCTIONS,
  specPatchDraftSchema,
  validateCustomerNoticeDraft,
  validateSpecPatchDraft,
} from "@hyrum/openai";
import type { ObjectStorage } from "@hyrum/storage";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({
  llmRunId: z.uuid(),
  subjectId: z.uuid(),
  task: z.enum(["spec_patch_draft", "customer_notice_draft"]),
});

export function createGenerateProductDraftHandler(config: {
  apiKey: string | undefined;
  storage: ObjectStorage;
}): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Advisory jobs must be tenant scoped");
    const payload = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const prepared = await prepareProductDraft(
      tx,
      context.organizationId,
      payload.llmRunId,
      payload.subjectId,
      payload.task,
    );
    if (!prepared) return;
    const isPatch = payload.task === "spec_patch_draft";
    let result: {
      output: z.infer<typeof specPatchDraftSchema> | z.infer<typeof customerNoticeDraftSchema>;
      responseId: string;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      inputDigest: string;
      outputDigest: string;
    };
    let fallbackCode: string | undefined;
    try {
      if (!config.apiKey)
        throw new AdvisoryModelError("request_failed", "OpenAI is not configured");
      const client = createOpenAIClient(config.apiKey);
      if (isPatch) {
        const completion = await runStructuredAdvisory({
          client,
          schema: specPatchDraftSchema,
          schemaName: "spec_patch_draft",
          instructions: SPEC_PATCH_INSTRUCTIONS,
          input: prepared.input,
          model: prepared.model,
          reasoningEffort: "medium",
          signal: context.signal,
        });
        validateSpecPatchDraft(prepared.input.citationResources, completion.output);
        result = completion;
      } else {
        const completion = await runStructuredAdvisory({
          client,
          schema: customerNoticeDraftSchema,
          schemaName: "customer_notice_draft",
          instructions: CUSTOMER_NOTICE_INSTRUCTIONS,
          input: prepared.input,
          model: prepared.model,
          reasoningEffort: "medium",
          signal: context.signal,
        });
        validateCustomerNoticeDraft(prepared.input.citationResources, completion.output);
        result = completion;
      }
    } catch (error) {
      const modelError =
        error instanceof AdvisoryModelError
          ? error
          : new AdvisoryModelError("invalid_output", "Draft failed deterministic validation", {
              cause: error,
            });
      if (
        (modelError.code === "request_failed" || modelError.code === "circuit_open") &&
        job.attempts < job.maxAttempts
      )
        throw modelError;
      fallbackCode = modelError.code;
      const output = isPatch
        ? fallbackSpecPatchDraft(modelError.code)
        : fallbackCustomerNoticeDraft(modelError.code);
      result = {
        output,
        responseId: "",
        model: prepared.model,
        inputTokens: null,
        outputTokens: null,
        inputDigest: prepared.inputDigest,
        outputDigest: createHash("sha256").update(JSON.stringify(output)).digest("hex"),
      };
    }
    const body = new TextEncoder().encode(JSON.stringify(result.output));
    const object = await config.storage.put({
      organizationId: context.organizationId,
      purpose: "generated-artifact",
      body,
      contentType: "application/json",
    });
    try {
      await config.storage.verify(object);
      const retained = await completeProductDraft(
        tx,
        context.organizationId,
        prepared,
        payload.task,
        {
          output: result.output,
          object,
          responseId: result.responseId || null,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          outputDigest: result.outputDigest,
          ...(fallbackCode ? { fallbackCode } : {}),
        },
      );
      if (!retained) await config.storage.delete(context.organizationId, object.objectKey);
    } catch (error) {
      await config.storage.delete(context.organizationId, object.objectKey).catch(() => undefined);
      throw error;
    }
  };
}
