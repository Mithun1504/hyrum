import { globalSearchQuerySchema, globalSearchResponseSchema } from "@hyrum/contracts";
import { searchOrganization } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/search",
    {
      preHandler: app.requirePermission("ledger:read"),
      schema: {
        tags: ["search"],
        security: [{ bearerAuth: [] }],
        querystring: globalSearchQuerySchema,
        response: { 200: globalSearchResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      return searchOrganization(
        app.database.db,
        context.organizationId,
        request.query.q,
        request.query.limit,
      );
    },
  );
};
