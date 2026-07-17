import { specDraftResponseSchema } from "@hyrum/contracts";
import {
  and,
  assertions,
  auditEvents,
  behaviorDefinitions,
  dependencyClaims,
  eq,
  llmRuns,
  operations,
  receiptIsUnexpired,
  receipts,
  withTenant,
} from "@hyrum/db";
import {
  deterministicSpecDraftFallback,
  draftOpenApiChange,
  type SpecDraftInput,
} from "@hyrum/openai";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { sha256Hex } from "../../domain/security";
import { requireContext } from "./helpers";

const paramsSchema = z.object({ id: z.uuid() });
const behaviorFingerprintSchema = z.object({ path: z.string(), value: z.unknown() }).passthrough();

function redactedEvidence(excerpt: unknown): string[] {
  const serialized = JSON.stringify(excerpt);
  if (!serialized || serialized.length > 50_000) {
    throw new Error("Receipt evidence is unavailable or exceeds the model input limit");
  }
  return [serialized];
}

export const specDraftRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/assertions/:id/spec-draft",
    {
      preHandler: app.requireHumanPermission("assertion:pin"),
      schema: {
        tags: ["assertions", "model-assistance"],
        security: [{ bearerAuth: [] }],
        params: paramsSchema,
        response: { 200: specDraftResponseSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const { row, evidence } = await withTenant(
        app.database.db,
        context.organizationId,
        async (tx) => {
          const [assertionRow] = await tx
            .select({
              assertion: assertions,
              behavior: behaviorDefinitions,
              claimReceiptId: dependencyClaims.receiptId,
            })
            .from(assertions)
            .innerJoin(
              behaviorDefinitions,
              and(
                eq(behaviorDefinitions.id, assertions.behaviorId),
                eq(behaviorDefinitions.organizationId, assertions.organizationId),
              ),
            )
            .leftJoin(
              dependencyClaims,
              and(
                eq(dependencyClaims.id, assertions.claimId),
                eq(dependencyClaims.organizationId, assertions.organizationId),
              ),
            )
            .where(
              and(
                eq(assertions.id, request.params.id),
                eq(assertions.organizationId, context.organizationId),
              ),
            )
            .limit(1);
          if (!assertionRow) throw app.httpErrors.notFound("Assertion not found");

          const receiptRows = assertionRow.claimReceiptId
            ? await tx
                .select({ receipt: receipts, operation: operations })
                .from(receipts)
                .leftJoin(
                  operations,
                  and(
                    eq(operations.id, receipts.operationId),
                    eq(operations.organizationId, receipts.organizationId),
                  ),
                )
                .where(
                  and(
                    eq(receipts.id, assertionRow.claimReceiptId),
                    eq(receipts.organizationId, context.organizationId),
                    receiptIsUnexpired(),
                  ),
                )
                .limit(1)
            : await tx
                .select({ receipt: receipts, operation: operations })
                .from(receipts)
                .leftJoin(
                  operations,
                  and(
                    eq(operations.id, receipts.operationId),
                    eq(operations.organizationId, receipts.organizationId),
                  ),
                )
                .where(
                  and(
                    eq(receipts.behaviorId, assertionRow.behavior.id),
                    eq(receipts.organizationId, context.organizationId),
                    receiptIsUnexpired(),
                  ),
                )
                .limit(1);
          return { row: assertionRow, evidence: receiptRows[0] };
        },
      );
      if (!evidence) throw app.httpErrors.unprocessableEntity("No receipt is available");
      if (!evidence.operation) {
        throw app.httpErrors.unprocessableEntity("Receipt has no API operation context");
      }

      const fingerprint = behaviorFingerprintSchema.parse(row.behavior.fingerprint);
      const input: SpecDraftInput = {
        method: evidence.operation.method,
        path: evidence.operation.pathTemplate,
        behaviorKind: row.behavior.kind,
        behaviorPath: fingerprint.path,
        description: row.assertion.reason,
        receiptIds: [evidence.receipt.id],
        redactedEvidence: redactedEvidence(evidence.receipt.excerpt),
      };

      let source: "model" | "fallback" = "model";
      let responseId: string | null = null;
      let model = "gpt-5.6";
      let promptVersion = "spec-draft-v1";
      let tokenUsage: unknown = null;
      let draft: ReturnType<typeof deterministicSpecDraftFallback>;
      try {
        const generated = await draftOpenApiChange(input);
        responseId = generated.responseId;
        model = generated.model;
        promptVersion = generated.promptVersion;
        tokenUsage = generated.tokenUsage ?? null;
        draft = generated.result;
      } catch (error) {
        source = "fallback";
        draft = deterministicSpecDraftFallback(input);
        request.log.warn(
          {
            err: error instanceof Error ? { name: error.name, message: error.message } : undefined,
          },
          "model-assisted spec draft unavailable",
        );
      }

      await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [run] = await tx
          .insert(llmRuns)
          .values({
            organizationId: context.organizationId,
            task: "openapi.spec_draft",
            model,
            promptVersion,
            schemaVersion: "hyrum_spec_draft_v1",
            responseId,
            status: source === "model" ? "completed" : "fallback",
            inputDigest: sha256Hex(input),
            resultDigest: sha256Hex(draft),
            tokenUsage,
            result: draft,
          })
          .returning({ id: llmRuns.id });
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: "assertion.spec_draft",
          resourceType: "llm_run",
          resourceId: run?.id,
          metadata: { assertion_id: row.assertion.id, source },
        });
      });

      return {
        source,
        response_id: responseId,
        model,
        prompt_version: promptVersion,
        draft,
      };
    },
  );
};
