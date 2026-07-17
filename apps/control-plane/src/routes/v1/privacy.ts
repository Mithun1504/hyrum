import {
  createDataSubjectRequestSchema,
  dataSubjectDownloadSchema,
  dataSubjectRequestListSchema,
  dataSubjectRequestPathSchema,
  dataSubjectRequestSchema,
} from "@hyrum/contracts";
import {
  createDataSubjectRequest,
  getOrganizationExportObject,
  listDataSubjectRequests,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const privacyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/privacy/requests",
    {
      preHandler: app.requirePermission("privacy:manage"),
      schema: {
        tags: ["privacy"],
        security: [{ bearerAuth: [] }],
        response: { 200: dataSubjectRequestListSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const rows = await listDataSubjectRequests(app.database.db, context.organizationId);
      return {
        data: rows.map((row) => ({
          ...row,
          requestedAt: row.requestedAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
        })),
      };
    },
  );

  app.post(
    "/privacy/requests",
    {
      preHandler: app.requirePermission("privacy:manage", { recentAuth: true }),
      schema: {
        tags: ["privacy"],
        security: [{ bearerAuth: [] }],
        body: createDataSubjectRequestSchema,
        response: { 202: dataSubjectRequestSchema.pick({ id: true, status: true }) },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const created = await createDataSubjectRequest(
          app.database.db,
          context.organizationId,
          {
            membershipId: context.actor.membershipId,
            userId: context.actor.actorId,
            requestId: request.id,
          },
          request.body,
        );
        return reply.code(202).send(created);
      } catch (error) {
        if (error instanceof Error) throw app.httpErrors.badRequest(error.message);
        throw error;
      }
    },
  );

  app.post(
    "/privacy/requests/:requestId/download",
    {
      preHandler: app.requirePermission("privacy:manage", { recentAuth: true }),
      schema: {
        tags: ["privacy"],
        security: [{ bearerAuth: [] }],
        params: dataSubjectRequestPathSchema,
        response: { 200: dataSubjectDownloadSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const object = await getOrganizationExportObject(
        app.database.db,
        context.organizationId,
        request.params.requestId,
      );
      if (!object) throw app.httpErrors.notFound("Completed export not found");
      const expiresInSeconds = 300;
      return {
        url: await app.objectStorage.signedReadUrl(
          context.organizationId,
          object.objectKey,
          expiresInSeconds,
        ),
        expiresInSeconds,
      };
    },
  );
};
