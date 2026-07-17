import {
  consumerInsightListSchema,
  endpointInsightListSchema,
  serviceInsightsSchema,
  servicePathParamsSchema,
} from "@hyrum/contracts";
import {
  getApiService,
  getServiceInsights,
  listConsumerInsights,
  listEndpointInsights,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const insightRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/insights",
    {
      preHandler: app.requirePermission("report:read"),
      schema: {
        tags: ["reports"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: serviceInsightsSchema },
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
      return getServiceInsights(app.database.db, context.organizationId, service.id);
    },
  );

  app.get(
    "/services/:identifier/consumers",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: consumerInsightListSchema },
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
      const records = await listConsumerInsights(
        app.database.db,
        context.organizationId,
        service.id,
      );
      return {
        data: records.map((record) => ({
          ...record,
          firstSeenAt: record.firstSeenAt.toISOString(),
          lastSeenAt: record.lastSeenAt.toISOString(),
        })),
      };
    },
  );

  app.get(
    "/services/:identifier/endpoints",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: endpointInsightListSchema },
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
      return {
        data: await listEndpointInsights(app.database.db, context.organizationId, service.id),
      };
    },
  );
};
