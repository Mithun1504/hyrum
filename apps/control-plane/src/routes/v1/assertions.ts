import {
  advisoryRunSchema,
  assertionListSchema,
  assertionPathParamsSchema,
  assertionQuerySchema,
  assertionSchema,
  breakingChangePlanSchema,
  createAssertionRequestSchema,
  draftReviewRequestSchema,
  extendAssertionRequestSchema,
  generatedDraftPathParamsSchema,
  generatedDraftResponseSchema,
  productDraftPathParamsSchema,
  resolveAssertionRequestSchema,
  scheduleBreakingChangeRequestSchema,
  servicePathParamsSchema,
} from "@hyrum/contracts";
import {
  AssertionDomainError,
  createAssertion,
  extendAssertion,
  getApiService,
  getProductDraft,
  listAssertions,
  requestProductDraft,
  resolveAssertion,
  reviewProductDraft,
  scheduleBreakingChange,
} from "@hyrum/db";
import {
  CUSTOMER_NOTICE_PROMPT_DIGEST,
  CUSTOMER_NOTICE_PROMPT_VERSION,
  CUSTOMER_NOTICE_SCHEMA_DIGEST,
  SPEC_PATCH_PROMPT_DIGEST,
  SPEC_PATCH_PROMPT_VERSION,
  SPEC_PATCH_SCHEMA_DIGEST,
} from "@hyrum/openai";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

function serializeAssertion(value: Awaited<ReturnType<typeof listAssertions>>[number]) {
  return {
    ...value,
    startsAt: value.startsAt.toISOString(),
    expiresAt: value.expiresAt.toISOString(),
    remindAt: value.remindAt?.toISOString() ?? null,
    breakingChangePlan: value.breakingChangePlan
      ? {
          ...value.breakingChangePlan,
          plannedFor: value.breakingChangePlan.plannedFor.toISOString(),
          communicationDueAt: value.breakingChangePlan.communicationDueAt?.toISOString() ?? null,
        }
      : null,
    updatedAt: value.updatedAt.toISOString(),
  };
}

function rethrowDomain(app: Parameters<FastifyPluginAsyncZod>[0], error: unknown): never {
  if (!(error instanceof AssertionDomainError)) throw error;
  if (error.code === "not_found") throw app.httpErrors.notFound(error.message);
  if (error.code === "conflict") throw app.httpErrors.conflict(error.message);
  throw app.httpErrors.unprocessableEntity(error.message);
}

export const assertionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/assertions/:assertionId/resolve",
    {
      preHandler: app.requirePermission("assertion:manage", { recentAuth: true }),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        params: assertionPathParamsSchema,
        body: resolveAssertionRequestSchema,
        response: { 204: { type: "null" } },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        await resolveAssertion(
          app.database.db,
          context.organizationId,
          request.params.assertionId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          {
            resolution: request.body.resolution,
            reason: request.body.reason,
            expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
          },
        );
        return reply.code(204).send();
      } catch (error) {
        return rethrowDomain(app, error);
      }
    },
  );

  app.get(
    "/assertions/:assertionId/spec-patch",
    {
      preHandler: app.requirePermission("assertion:read"),
      schema: {
        tags: ["assertions", "ai"],
        security: [{ bearerAuth: [] }],
        params: assertionPathParamsSchema,
        response: { 200: generatedDraftResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const draft = await getProductDraft(
        app.database.db,
        context.organizationId,
        request.params.assertionId,
        "spec_patch",
        "assertion",
      );
      if (!draft) return { data: null };
      if (draft.byteSize > 128_000n)
        throw app.httpErrors.internalServerError("Draft exceeds read limit");
      const bytes = await app.objectStorage.read(
        context.organizationId,
        draft.objectKey,
        Number(draft.byteSize),
      );
      const output = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
      const citations = draft.citations.map((citation) => {
        if (citation.receiptId)
          return {
            resourceType: "receipt" as const,
            resourceId: citation.receiptId,
            role: citation.role as "supports" | "context" | "counterexample",
          };
        if (citation.dependencyClaimId)
          return {
            resourceType: "dependency_claim" as const,
            resourceId: citation.dependencyClaimId,
            role: citation.role as "supports" | "context" | "counterexample",
          };
        if (citation.behaviorDefinitionId)
          return {
            resourceType: "behavior_definition" as const,
            resourceId: citation.behaviorDefinitionId,
            role: citation.role as "supports" | "context" | "counterexample",
          };
        throw new Error("Draft citation has no resource");
      });
      return {
        data: {
          id: draft.id,
          llmRunId: draft.llmRunId,
          draftType: "spec_patch" as const,
          status: draft.status,
          modelStatus: draft.modelStatus,
          model: draft.model,
          content: {
            draftType: "spec_patch" as const,
            title: String(output.title),
            rationale: String(output.rationale),
            patch: String(output.patch),
            format:
              output.format === "yaml_fragment"
                ? ("yaml_fragment" as const)
                : ("json_patch" as const),
          },
          uncertainty: Number(output.uncertainty),
          abstained: Boolean(output.abstained),
          abstentionReason:
            typeof output.abstentionReason === "string" ? output.abstentionReason : null,
          schemaValid: draft.schemaValid,
          outputDigest: draft.outputDigest,
          promptVersion: draft.promptVersion,
          citations,
          createdAt: draft.createdAt.toISOString(),
        },
      };
    },
  );

  app.post(
    "/assertions/:assertionId/spec-patch",
    {
      preHandler: app.requirePermission("assertion:manage"),
      schema: {
        tags: ["assertions", "ai"],
        security: [{ bearerAuth: [] }],
        params: assertionPathParamsSchema,
        response: { 202: advisoryRunSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      try {
        const run = await requestProductDraft(
          app.database.db,
          context.organizationId,
          request.params.assertionId,
          "spec_patch_draft",
          { userId: context.actor.actorId, requestId: request.id },
          {
            version: SPEC_PATCH_PROMPT_VERSION,
            model: app.runtimeEnv.OPENAI_HIGH_VALUE_MODEL,
            promptDigest: SPEC_PATCH_PROMPT_DIGEST,
            schemaDigest: SPEC_PATCH_SCHEMA_DIGEST,
            sourceRevision: `builtin:spec-patch:v${SPEC_PATCH_PROMPT_VERSION}`,
          },
        );
        if (!run) throw app.httpErrors.notFound("Assertion not found");
        return reply.code(202).send({ llmRunId: run.id, status: run.status });
      } catch (error) {
        if (error instanceof Error && /active assertion/.test(error.message))
          throw app.httpErrors.unprocessableEntity(error.message);
        throw error;
      }
    },
  );

  app.get(
    "/breaking-change-plans/:planId/drafts/:draftType",
    {
      preHandler: app.requirePermission("assertion:read"),
      schema: {
        tags: ["assertions", "ai"],
        security: [{ bearerAuth: [] }],
        params: productDraftPathParamsSchema,
        response: { 200: generatedDraftResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const draft = await getProductDraft(
        app.database.db,
        context.organizationId,
        request.params.planId,
        request.params.draftType,
      );
      if (!draft) return { data: null };
      if (draft.byteSize > 128_000n)
        throw app.httpErrors.internalServerError("Draft exceeds read limit");
      const bytes = await app.objectStorage.read(
        context.organizationId,
        draft.objectKey,
        Number(draft.byteSize),
      );
      const output = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
      const citations = draft.citations.map((citation) => {
        if (citation.receiptId)
          return {
            resourceType: "receipt" as const,
            resourceId: citation.receiptId,
            role: citation.role as "supports" | "context" | "counterexample",
          };
        if (citation.dependencyClaimId)
          return {
            resourceType: "dependency_claim" as const,
            resourceId: citation.dependencyClaimId,
            role: citation.role as "supports" | "context" | "counterexample",
          };
        if (citation.behaviorDefinitionId)
          return {
            resourceType: "behavior_definition" as const,
            resourceId: citation.behaviorDefinitionId,
            role: citation.role as "supports" | "context" | "counterexample",
          };
        throw new Error("Draft citation has no resource");
      });
      const content =
        request.params.draftType === "spec_patch"
          ? {
              draftType: "spec_patch" as const,
              title: String(output.title),
              rationale: String(output.rationale),
              patch: String(output.patch),
              format:
                output.format === "yaml_fragment"
                  ? ("yaml_fragment" as const)
                  : ("json_patch" as const),
            }
          : {
              draftType: "customer_notice" as const,
              subject: String(output.subject),
              body: String(output.body),
              audienceSummary: String(output.audienceSummary),
            };
      return {
        data: {
          id: draft.id,
          llmRunId: draft.llmRunId,
          draftType: request.params.draftType,
          status: draft.status,
          modelStatus: draft.modelStatus,
          model: draft.model,
          content,
          uncertainty: Number(output.uncertainty),
          abstained: Boolean(output.abstained),
          abstentionReason:
            typeof output.abstentionReason === "string" ? output.abstentionReason : null,
          schemaValid: draft.schemaValid,
          outputDigest: draft.outputDigest,
          promptVersion: draft.promptVersion,
          citations,
          createdAt: draft.createdAt.toISOString(),
        },
      };
    },
  );

  app.post(
    "/breaking-change-plans/:planId/drafts/:draftType",
    {
      preHandler: app.requirePermission("assertion:manage"),
      schema: {
        tags: ["assertions", "ai"],
        security: [{ bearerAuth: [] }],
        params: productDraftPathParamsSchema,
        response: { 202: advisoryRunSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const patch = request.params.draftType === "spec_patch";
      try {
        const run = await requestProductDraft(
          app.database.db,
          context.organizationId,
          request.params.planId,
          patch ? "spec_patch_draft" : "customer_notice_draft",
          { userId: context.actor.actorId, requestId: request.id },
          patch
            ? {
                version: SPEC_PATCH_PROMPT_VERSION,
                model: app.runtimeEnv.OPENAI_HIGH_VALUE_MODEL,
                promptDigest: SPEC_PATCH_PROMPT_DIGEST,
                schemaDigest: SPEC_PATCH_SCHEMA_DIGEST,
                sourceRevision: `builtin:spec-patch:v${SPEC_PATCH_PROMPT_VERSION}`,
              }
            : {
                version: CUSTOMER_NOTICE_PROMPT_VERSION,
                model: app.runtimeEnv.OPENAI_HIGH_VALUE_MODEL,
                promptDigest: CUSTOMER_NOTICE_PROMPT_DIGEST,
                schemaDigest: CUSTOMER_NOTICE_SCHEMA_DIGEST,
                sourceRevision: `builtin:customer-notice:v${CUSTOMER_NOTICE_PROMPT_VERSION}`,
              },
        );
        if (!run) throw app.httpErrors.notFound("Breaking-change plan not found");
        return reply.code(202).send({ llmRunId: run.id, status: run.status });
      } catch (error) {
        if (error instanceof Error && /active scheduled/.test(error.message))
          throw app.httpErrors.unprocessableEntity(error.message);
        throw error;
      }
    },
  );

  app.post(
    "/generated-drafts/:draftId/review",
    {
      preHandler: app.requirePermission("assertion:manage", { recentAuth: true }),
      schema: {
        tags: ["assertions", "ai"],
        security: [{ bearerAuth: [] }],
        params: generatedDraftPathParamsSchema,
        body: draftReviewRequestSchema,
        response: { 204: { type: "null" } },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const reviewed = await reviewProductDraft(
        app.database.db,
        context.organizationId,
        request.params.draftId,
        context.actor.membershipId,
        context.actor.actorId,
        request.id,
        request.body.decision,
      );
      if (!reviewed) throw app.httpErrors.conflict("Draft was not found or was already reviewed");
      return reply.code(204).send();
    },
  );

  app.get(
    "/services/:identifier/assertions",
    {
      preHandler: app.requirePermission("assertion:read"),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        querystring: assertionQuerySchema,
        response: { 200: assertionListSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      const records = await listAssertions(
        app.database.db,
        context.organizationId,
        service.id,
        request.query.status,
      );
      return { data: records.map(serializeAssertion) };
    },
  );

  app.post(
    "/services/:identifier/assertions",
    {
      preHandler: app.requirePermission("assertion:manage", { recentAuth: true }),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        body: createAssertionRequestSchema,
        response: { 201: assertionSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      try {
        const created = await createAssertion(
          app.database.db,
          context.organizationId,
          service.id,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          {
            behaviorDefinitionId: request.body.behaviorDefinitionId,
            ...(request.body.sourceClaimId ? { sourceClaimId: request.body.sourceClaimId } : {}),
            ownerMembershipId: request.body.ownerMembershipId,
            reason: request.body.reason,
            scope: request.body.scope,
            consumerIds: request.body.consumerIds,
            expiresAt: new Date(request.body.expiresAt),
            ...(request.body.remindAt ? { remindAt: new Date(request.body.remindAt) } : {}),
          },
        );
        const record = (
          await listAssertions(app.database.db, context.organizationId, service.id)
        ).find(({ id }) => id === created.id);
        if (!record) throw new Error("Created assertion could not be loaded");
        return reply.code(201).send(serializeAssertion(record));
      } catch (error) {
        return rethrowDomain(app, error);
      }
    },
  );

  app.post(
    "/assertions/:assertionId/extend",
    {
      preHandler: app.requirePermission("assertion:manage", { recentAuth: true }),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        params: assertionPathParamsSchema,
        body: extendAssertionRequestSchema,
        response: { 200: assertionSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const extended = await extendAssertion(
          app.database.db,
          context.organizationId,
          request.params.assertionId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          {
            expiresAt: new Date(request.body.expiresAt),
            ...(request.body.remindAt ? { remindAt: new Date(request.body.remindAt) } : {}),
            reason: request.body.reason,
            expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
          },
        );
        const record = (
          await listAssertions(app.database.db, context.organizationId, extended.apiServiceId)
        ).find(({ id }) => id === extended.id);
        if (!record) throw new Error("Extended assertion could not be loaded");
        return serializeAssertion(record);
      } catch (error) {
        return rethrowDomain(app, error);
      }
    },
  );

  app.post(
    "/assertions/:assertionId/schedule-break",
    {
      preHandler: app.requirePermission("assertion:manage", { recentAuth: true }),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        params: assertionPathParamsSchema,
        body: scheduleBreakingChangeRequestSchema,
        response: { 201: breakingChangePlanSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const plan = await scheduleBreakingChange(
          app.database.db,
          context.organizationId,
          request.params.assertionId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          {
            plannedFor: new Date(request.body.plannedFor),
            ...(request.body.communicationDueAt
              ? { communicationDueAt: new Date(request.body.communicationDueAt) }
              : {}),
            reason: request.body.reason,
            expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
          },
        );
        return reply.code(201).send({
          id: plan.id,
          assertionId: request.params.assertionId,
          status: plan.status,
          plannedFor: plan.plannedFor.toISOString(),
          communicationDueAt: plan.communicationDueAt?.toISOString() ?? null,
          impactCount: plan.impactCount,
        });
      } catch (error) {
        return rethrowDomain(app, error);
      }
    },
  );
};
