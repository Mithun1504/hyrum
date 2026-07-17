import {
  apiServiceSchema,
  createServiceRequestSchema,
  cursorPageQuerySchema,
  serviceListSchema,
  servicePathParamsSchema,
} from "@hyrum/contracts";
import { createApiService, getApiService, listApiServices } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { decodeServiceCursor, encodeServiceCursor } from "../../lib/cursor";

function serializeService(record: Awaited<ReturnType<typeof createApiService>>) {
  return {
    ...record,
    firstCaptureAt: record.firstCaptureAt?.toISOString() ?? null,
    firstUsefulLedgerAt: record.firstUsefulLedgerAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export const serviceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services",
    {
      preHandler: app.requirePermission("service:read"),
      schema: {
        tags: ["services"],
        security: [{ bearerAuth: [] }],
        querystring: cursorPageQuerySchema,
        response: { 200: serviceListSchema },
      },
    },
    async (request) => {
      const organizationId = request.authContext?.organizationId;
      if (!organizationId) throw app.httpErrors.unauthorized();
      let cursor: ReturnType<typeof decodeServiceCursor>;
      try {
        cursor = decodeServiceCursor(request.query.cursor);
      } catch {
        throw app.httpErrors.badRequest("Invalid pagination cursor");
      }
      const result = await listApiServices(
        app.database.db,
        organizationId,
        request.query.limit,
        cursor,
      );
      return {
        data: result.records.map(serializeService),
        page: {
          hasMore: result.nextCursor !== null,
          nextCursor: result.nextCursor ? encodeServiceCursor(result.nextCursor) : null,
        },
      };
    },
  );

  app.get(
    "/services/:identifier",
    {
      preHandler: app.requirePermission("service:read"),
      schema: {
        tags: ["services"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: apiServiceSchema },
      },
    },
    async (request) => {
      const organizationId = request.authContext?.organizationId;
      if (!organizationId) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      return serializeService(service);
    },
  );

  app.post(
    "/services",
    {
      preHandler: app.requirePermission("service:manage"),
      schema: {
        tags: ["services"],
        security: [{ bearerAuth: [] }],
        body: createServiceRequestSchema,
        response: { 201: apiServiceSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const service = await createApiService(
          app.database.db,
          context.organizationId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          request.body,
        );
        return reply.code(201).send(serializeService(service));
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw app.httpErrors.conflict("A service with this slug already exists");
        }
        throw error;
      }
    },
  );
};
