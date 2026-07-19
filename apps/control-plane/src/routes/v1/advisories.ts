import {
  and,
  auditEvents,
  behaviorDefinitions,
  consumers,
  corpusItems,
  dependencyClaims,
  eq,
  inArray,
  llmRuns,
  receiptIsUnexpired,
  receipts,
  withTenant,
} from "@hyrum/db";
import {
  advisoryModelResultSchema,
  behaviorClusterResultSchema,
  clusterAndNameBehaviors,
  explainConsumerImpact,
  impactExplanationResultSchema,
  prioritizeReplayCorpus,
  proposeEvidenceTiers,
  replayPriorityResultSchema,
  tierProposalResultSchema,
} from "@hyrum/openai";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { sha256Hex } from "../../domain/security";
import { requireContext } from "./helpers";

const roleSchema = z.enum([
  "behavior_clusters",
  "tier_proposals",
  "replay_priorities",
  "impact_explanations",
]);
const requestSchema = z.object({ entity_ids: z.array(z.uuid()).min(1).max(100) }).strict();
const responseSchema = z
  .object({
    role: roleSchema,
    run_id: z.uuid(),
    model: z.string(),
    prompt_version: z.string(),
    result: z.union([
      behaviorClusterResultSchema,
      tierProposalResultSchema,
      replayPriorityResultSchema,
      impactExplanationResultSchema,
      advisoryModelResultSchema,
    ]),
  })
  .strict();

type AdvisoryRole = z.infer<typeof roleSchema>;

function excerptForModel(app: Parameters<FastifyPluginAsyncZod>[0], value: unknown) {
  const encoded = JSON.stringify(value);
  if (!encoded || encoded.length > 50_000)
    throw app.httpErrors.unprocessableEntity(
      "Receipt evidence is unavailable or exceeds the model input limit",
    );
  return value;
}

export const advisoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/model-assistance/:role",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["model-assistance"],
        security: [{ bearerAuth: [] }],
        params: z.object({ role: roleSchema }),
        body: requestSchema,
        response: { 200: responseSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const input = await buildInput(
        app,
        context.organizationId,
        request.params.role,
        request.body.entity_ids,
      );

      let generated: Awaited<ReturnType<typeof runRole>>;
      try {
        generated = await runRole(request.params.role, input);
      } catch (error) {
        request.log.warn(
          {
            err: error instanceof Error ? { name: error.name, message: error.message } : undefined,
          },
          "model advisory unavailable",
        );
        throw app.httpErrors.serviceUnavailable("Model advisory is temporarily unavailable");
      }

      const runId = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [run] = await tx
          .insert(llmRuns)
          .values({
            organizationId: context.organizationId,
            task: request.params.role,
            model: generated.model,
            promptVersion: generated.promptVersion,
            schemaVersion: `hyrum_${request.params.role}_v1`,
            responseId: generated.responseId,
            status: "completed",
            inputDigest: sha256Hex(input),
            resultDigest: sha256Hex(generated.result),
            tokenUsage: generated.tokenUsage ?? null,
            result: generated.result,
          })
          .returning({ id: llmRuns.id });
        if (!run) throw new Error("Failed to persist model advisory");
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: `model.${request.params.role}`,
          resourceType: "llm_run",
          resourceId: run.id,
          metadata: { entity_count: request.body.entity_ids.length },
        });
        return run.id;
      });

      return {
        role: request.params.role,
        run_id: runId,
        model: generated.model,
        prompt_version: generated.promptVersion,
        result: generated.result,
      };
    },
  );
};

async function buildInput(
  app: Parameters<FastifyPluginAsyncZod>[0],
  organizationId: string,
  role: AdvisoryRole,
  entityIds: string[],
) {
  return withTenant(app.database.db, organizationId, async (tx) => {
    if (role === "behavior_clusters") {
      const rows = await tx
        .select({ behavior: behaviorDefinitions, receipt: receipts })
        .from(behaviorDefinitions)
        .innerJoin(
          receipts,
          and(
            eq(receipts.organizationId, behaviorDefinitions.organizationId),
            eq(receipts.behaviorId, behaviorDefinitions.id),
            receiptIsUnexpired(),
          ),
        )
        .where(
          and(
            eq(behaviorDefinitions.organizationId, organizationId),
            inArray(behaviorDefinitions.id, entityIds),
          ),
        );
      ensureComplete(
        app,
        entityIds,
        rows.map((row) => row.behavior.id),
      );
      return {
        receiptIds: unique(rows.map((row) => row.receipt.id)),
        redactedEvidence: rows.map((row) => excerptForModel(app, row.receipt.excerpt)),
        behaviors: rows.map((row) => ({
          id: row.behavior.id,
          kind: row.behavior.kind,
          fingerprint: row.behavior.fingerprint,
          label: row.behavior.label,
        })),
      };
    }

    if (role === "replay_priorities") {
      const items = await tx
        .select()
        .from(corpusItems)
        .where(
          and(eq(corpusItems.organizationId, organizationId), inArray(corpusItems.id, entityIds)),
        );
      ensureComplete(
        app,
        entityIds,
        items.map((item) => item.id),
      );
      const receiptIds = unique(
        items.flatMap((item) => {
          const value = item.requestMetadata as { receipt_ids?: unknown };
          return Array.isArray(value.receipt_ids)
            ? value.receipt_ids.filter((id): id is string => typeof id === "string")
            : [];
        }),
      );
      if (receiptIds.length === 0)
        throw app.httpErrors.unprocessableEntity(
          "Replay cases must cite receipt_ids in request metadata",
        );
      const evidence = await tx
        .select()
        .from(receipts)
        .where(
          and(
            eq(receipts.organizationId, organizationId),
            inArray(receipts.id, receiptIds),
            receiptIsUnexpired(),
          ),
        );
      ensureComplete(
        app,
        receiptIds,
        evidence.map((receipt) => receipt.id),
      );
      return {
        receiptIds,
        redactedEvidence: evidence.map((receipt) => excerptForModel(app, receipt.excerpt)),
        cases: items.map((item) => ({
          caseId: item.caseId,
          coverageClass: item.coverageClass,
          currentPriority: item.priority,
          metadata: item.requestMetadata,
        })),
      };
    }

    const claims = await tx
      .select({
        claim: dependencyClaims,
        behavior: behaviorDefinitions,
        consumer: consumers,
        receipt: receipts,
      })
      .from(dependencyClaims)
      .innerJoin(
        behaviorDefinitions,
        and(
          eq(behaviorDefinitions.organizationId, dependencyClaims.organizationId),
          eq(behaviorDefinitions.id, dependencyClaims.behaviorId),
        ),
      )
      .innerJoin(
        consumers,
        and(
          eq(consumers.organizationId, dependencyClaims.organizationId),
          eq(consumers.id, dependencyClaims.consumerId),
        ),
      )
      .innerJoin(
        receipts,
        and(
          eq(receipts.organizationId, dependencyClaims.organizationId),
          eq(receipts.id, dependencyClaims.receiptId),
          receiptIsUnexpired(),
        ),
      )
      .where(
        and(
          eq(dependencyClaims.organizationId, organizationId),
          inArray(dependencyClaims.id, entityIds),
        ),
      );
    ensureComplete(
      app,
      entityIds,
      claims.map((row) => row.claim.id),
    );
    const common = {
      receiptIds: unique(claims.map((row) => row.receipt.id)),
      redactedEvidence: claims.map((row) => excerptForModel(app, row.receipt.excerpt)),
    };
    if (role === "tier_proposals") {
      return {
        ...common,
        claims: claims.map((row) => ({
          claimId: row.claim.id,
          echoEligible: row.claim.tier === "T1",
          currentTier: row.claim.humanOverrideTier ?? row.claim.tier,
          fingerprint: row.behavior.fingerprint,
        })),
      };
    }
    return {
      ...common,
      consumers: claims.map((row) => ({
        consumerId: row.consumer.id,
        alias: row.consumer.displayAlias,
        claimId: row.claim.id,
        tier: row.claim.humanOverrideTier ?? row.claim.tier,
        behavior: row.behavior.fingerprint,
      })),
    };
  });
}

function runRole(role: AdvisoryRole, input: Awaited<ReturnType<typeof buildInput>>) {
  if (role === "behavior_clusters")
    return clusterAndNameBehaviors(input as Parameters<typeof clusterAndNameBehaviors>[0]);
  if (role === "tier_proposals")
    return proposeEvidenceTiers(input as Parameters<typeof proposeEvidenceTiers>[0]);
  if (role === "replay_priorities")
    return prioritizeReplayCorpus(input as Parameters<typeof prioritizeReplayCorpus>[0]);
  return explainConsumerImpact(input as Parameters<typeof explainConsumerImpact>[0]);
}

function ensureComplete(
  app: Parameters<FastifyPluginAsyncZod>[0],
  requested: string[],
  loaded: string[],
) {
  const loadedSet = new Set(loaded);
  if (requested.some((id) => !loadedSet.has(id)))
    throw app.httpErrors.unprocessableEntity(
      "One or more entities lack tenant-scoped unexpired receipt evidence",
    );
}

function unique(values: string[]) {
  return [...new Set(values)];
}
