import {
  gatePolicySchema,
  servicePathParamsSchema,
  updateGatePolicySchema,
} from "@hyrum/contracts";
import {
  GatePolicyError,
  getApiService,
  getDefaultGatePolicy,
  updateDefaultGatePolicy,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

function serialize(policy: NonNullable<Awaited<ReturnType<typeof getDefaultGatePolicy>>>) {
  return { ...policy, activatedAt: policy.activatedAt.toISOString() };
}

export const gatePolicyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/gate-policy",
    {
      preHandler: app.requirePermission("policy:read"),
      schema: {
        tags: ["gates"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: gatePolicySchema },
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
      const policy = await getDefaultGatePolicy(
        app.database.db,
        context.organizationId,
        service.id,
      );
      if (!policy) throw app.httpErrors.notFound("Default gate policy not found");
      return serialize(policy);
    },
  );

  app.put(
    "/services/:identifier/gate-policy",
    {
      preHandler: app.requirePermission("policy:manage", { recentAuth: true }),
      schema: {
        tags: ["gates"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        body: updateGatePolicySchema,
        response: { 200: gatePolicySchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      try {
        await updateDefaultGatePolicy(
          app.database.db,
          context.organizationId,
          service.id,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          request.body,
        );
        const policy = await getDefaultGatePolicy(
          app.database.db,
          context.organizationId,
          service.id,
        );
        if (!policy) throw new Error("Updated gate policy could not be loaded");
        return serialize(policy);
      } catch (error) {
        if (!(error instanceof GatePolicyError)) throw error;
        if (error.code === "not_found") throw app.httpErrors.notFound(error.message);
        throw app.httpErrors.conflict(error.message);
      }
    },
  );
};
