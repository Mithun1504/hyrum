import { serviceHealthReportSchema, servicePathParamsSchema } from "@hyrum/contracts";
import { getApiService, getServiceHealthReport } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const reportingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/reports/health",
    {
      preHandler: app.requirePermission("report:read"),
      schema: {
        tags: ["reporting"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: serviceHealthReportSchema },
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
      const report = await getServiceHealthReport(
        app.database.db,
        context.organizationId,
        service.id,
      );
      if (!report) throw app.httpErrors.notFound("Service not found");
      return { ...report, generatedAt: report.generatedAt.toISOString() };
    },
  );
};
