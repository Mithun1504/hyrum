import {
  advisoryBatchRequestSchema,
  advisoryBatchResponseSchema,
  advisoryRunSchema,
  behaviorLabelPathParamsSchema,
  behaviorLabelProposalResponseSchema,
  behaviorPathParamsSchema,
  claimPathParamsSchema,
  draftReviewRequestSchema,
  tierProposalResponseSchema,
} from "@hyrum/contracts";
import {
  getAdvisoryBatch,
  getBehaviorLabelProposal,
  getTierProposal,
  requestBehaviorLabelProposal,
  requestTierProposal,
  reviewBehaviorLabelProposal,
} from "@hyrum/db";
import {
  BEHAVIOR_LABEL_PROMPT_DIGEST,
  BEHAVIOR_LABEL_PROMPT_VERSION,
  BEHAVIOR_LABEL_SCHEMA_DIGEST,
  TIER_PROPOSAL_PROMPT_DIGEST,
  TIER_PROPOSAL_PROMPT_VERSION,
  TIER_PROPOSAL_SCHEMA_DIGEST,
} from "@hyrum/openai";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const behaviorAdvisoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/advisories/batch",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["ledger", "ai"],
        security: [{ bearerAuth: [] }],
        body: advisoryBatchRequestSchema,
        response: { 200: advisoryBatchResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const result = await getAdvisoryBatch(app.database.db, context.organizationId, request.body);
      return {
        labels: result.labels.map(({ behaviorDefinitionId, ...proposal }) => ({
          behaviorDefinitionId,
          proposal: {
            ...proposal,
            llmRunId: proposal.llmRunId as string,
            createdAt: proposal.createdAt.toISOString(),
          },
        })),
        tiers: result.tiers.flatMap(({ dependencyClaimId, ...proposal }) =>
          dependencyClaimId && proposal.proposedTier !== "t1"
            ? [
                {
                  dependencyClaimId,
                  proposal: {
                    ...proposal,
                    proposedTier: proposal.proposedTier,
                    llmRunId: proposal.llmRunId as string,
                    createdAt: proposal.createdAt.toISOString(),
                  },
                },
              ]
            : [],
        ),
      };
    },
  );
  app.get(
    "/claims/:claimId/tier-proposal",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["ledger", "ai"],
        security: [{ bearerAuth: [] }],
        params: claimPathParamsSchema,
        response: { 200: tierProposalResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const proposal = await getTierProposal(
        app.database.db,
        context.organizationId,
        request.params.claimId,
      );
      if (proposal?.proposedTier === "t1") {
        throw new Error("Persisted model tier proposal violates the T2/T3 boundary");
      }
      return {
        data: proposal
          ? {
              ...proposal,
              proposedTier: proposal.proposedTier === "t2" ? ("t2" as const) : ("t3" as const),
              llmRunId: proposal.llmRunId as string,
              createdAt: proposal.createdAt.toISOString(),
            }
          : null,
      };
    },
  );

  app.post(
    "/claims/:claimId/tier-proposal",
    {
      preHandler: app.requirePermission("claim:review"),
      schema: {
        tags: ["ledger", "ai"],
        security: [{ bearerAuth: [] }],
        params: claimPathParamsSchema,
        response: { 202: advisoryRunSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const run = await requestTierProposal(
        app.database.db,
        context.organizationId,
        request.params.claimId,
        { userId: context.actor.actorId, requestId: request.id },
        {
          version: TIER_PROPOSAL_PROMPT_VERSION,
          model: app.runtimeEnv.OPENAI_DEFAULT_MODEL,
          promptDigest: TIER_PROPOSAL_PROMPT_DIGEST,
          schemaDigest: TIER_PROPOSAL_SCHEMA_DIGEST,
          sourceRevision: `builtin:tier-proposal:v${TIER_PROPOSAL_PROMPT_VERSION}`,
        },
      );
      if (!run) throw app.httpErrors.notFound("Dependency claim not found");
      return reply.code(202).send({ llmRunId: run.id, status: run.status });
    },
  );

  app.get(
    "/behaviors/:behaviorId/label-proposal",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["ledger", "ai"],
        security: [{ bearerAuth: [] }],
        params: behaviorPathParamsSchema,
        response: { 200: behaviorLabelProposalResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const proposal = await getBehaviorLabelProposal(
        app.database.db,
        context.organizationId,
        request.params.behaviorId,
      );
      return {
        data: proposal
          ? {
              ...proposal,
              llmRunId: proposal.llmRunId as string,
              createdAt: proposal.createdAt.toISOString(),
            }
          : null,
      };
    },
  );

  app.post(
    "/behaviors/:behaviorId/label-proposal",
    {
      preHandler: app.requirePermission("claim:review"),
      schema: {
        tags: ["ledger", "ai"],
        security: [{ bearerAuth: [] }],
        params: behaviorPathParamsSchema,
        response: { 202: advisoryRunSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const run = await requestBehaviorLabelProposal(
        app.database.db,
        context.organizationId,
        request.params.behaviorId,
        { userId: context.actor.actorId, requestId: request.id },
        {
          version: BEHAVIOR_LABEL_PROMPT_VERSION,
          model: app.runtimeEnv.OPENAI_DEFAULT_MODEL,
          promptDigest: BEHAVIOR_LABEL_PROMPT_DIGEST,
          schemaDigest: BEHAVIOR_LABEL_SCHEMA_DIGEST,
          sourceRevision: `builtin:behavior-label:v${BEHAVIOR_LABEL_PROMPT_VERSION}`,
        },
      );
      if (!run) throw app.httpErrors.notFound("Behavior not found");
      return reply.code(202).send({ llmRunId: run.id, status: run.status });
    },
  );

  app.post(
    "/behavior-labels/:labelId/review",
    {
      preHandler: app.requirePermission("claim:review", { recentAuth: true }),
      schema: {
        tags: ["ledger", "ai"],
        security: [{ bearerAuth: [] }],
        params: behaviorLabelPathParamsSchema,
        body: draftReviewRequestSchema,
        response: { 204: { type: "null" } },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const reviewed = await reviewBehaviorLabelProposal(
          app.database.db,
          context.organizationId,
          request.params.labelId,
          {
            membershipId: context.actor.membershipId,
            userId: context.actor.actorId,
            requestId: request.id,
          },
          request.body.decision,
        );
        if (!reviewed) throw app.httpErrors.conflict("Label was not found or already reviewed");
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof Error && /abstained|failed/.test(error.message)) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        throw error;
      }
    },
  );
};
