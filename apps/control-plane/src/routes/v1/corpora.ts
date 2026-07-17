import {
  corpusBuildResponseSchema,
  corpusPathParamsSchema,
  receiptAccessSchema,
  replayCorpusWorkspaceSchema,
  servicePathParamsSchema,
} from "@hyrum/contracts";
import {
  authorizeReplayCorpusRead,
  getActiveReplayProfile,
  getApiService,
  listReplayCorpora,
  requestReplayCorpusBuild,
  withOrganizationContext,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

function serializeCorpus(record: Awaited<ReturnType<typeof listReplayCorpora>>[number]) {
  return {
    ...record,
    sourceWindowStart: record.sourceWindowStart.toISOString(),
    sourceWindowEnd: record.sourceWindowEnd.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

export const corpusRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/corpora",
    {
      preHandler: app.requirePermission("corpus:read"),
      schema: {
        tags: ["corpora"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: replayCorpusWorkspaceSchema },
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
      const result = await withOrganizationContext(
        app.database.db,
        context.organizationId,
        async (tx) => ({
          corpora: await listReplayCorpora(tx, context.organizationId, service.id),
          profile: await getActiveReplayProfile(tx, context.organizationId, service.id),
        }),
      );
      if (!result.profile) throw app.httpErrors.conflict("Active replay profile is not configured");
      return { profile: result.profile, corpora: result.corpora.map(serializeCorpus) };
    },
  );

  app.post(
    "/services/:identifier/corpora/build",
    {
      preHandler: app.requirePermission("corpus:manage", { recentAuth: true }),
      schema: {
        tags: ["corpora"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 202: corpusBuildResponseSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      const result = await requestReplayCorpusBuild(
        app.database.db,
        context.organizationId,
        service.id,
        {
          userId: context.actor.actorId,
          requestId: request.id,
          actorType:
            context.actor.principalType === "platform_operator" ? "platform_operator" : "user",
          ...(context.actor.supportAccessGrantId
            ? { supportAccessGrantId: context.actor.supportAccessGrantId }
            : {}),
        },
      );
      return reply.code(202).send({ accepted: true, ...result });
    },
  );

  app.post(
    "/corpora/:corpusId/access",
    {
      preHandler: app.requirePermission("corpus:read"),
      schema: {
        tags: ["corpora"],
        security: [{ bearerAuth: [] }],
        params: corpusPathParamsSchema,
        response: { 200: receiptAccessSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const authorized = await authorizeReplayCorpusRead(
        app.database.db,
        context.organizationId,
        request.params.corpusId,
        {
          userId: context.actor.actorId,
          requestId: request.id,
          actorType:
            context.actor.principalType === "platform_operator" ? "platform_operator" : "user",
          ...(context.actor.supportAccessGrantId
            ? { supportAccessGrantId: context.actor.supportAccessGrantId }
            : {}),
        },
      );
      if (!authorized) throw app.httpErrors.gone("Corpus is missing, unavailable, or expired");
      if (authorized.bucket !== app.objectStorage.bucket) {
        throw app.httpErrors.serviceUnavailable("Corpus storage is not configured");
      }
      const expiresIn = 60;
      const url = await app.objectStorage.signedReadUrl(
        context.organizationId,
        authorized.objectKey,
        expiresIn,
      );
      return { url, expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString() };
    },
  );
};
