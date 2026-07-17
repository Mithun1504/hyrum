import { onboardingProgressSchema, servicePathParamsSchema } from "@hyrum/contracts";
import { getServiceOnboardingProgress } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const onboardingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/onboarding",
    {
      preHandler: app.requirePermission("service:read"),
      schema: {
        tags: ["onboarding"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: onboardingProgressSchema },
      },
    },
    async (request) => {
      const organizationId = request.authContext?.organizationId;
      if (!organizationId) throw app.httpErrors.unauthorized();
      const progress = await getServiceOnboardingProgress(
        app.database.db,
        organizationId,
        request.params.identifier,
      );
      if (!progress) throw app.httpErrors.notFound("Onboarding progress not found");
      return progress;
    },
  );
};
