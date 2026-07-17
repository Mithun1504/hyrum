import {
  gateExceptionListSchema,
  gateExceptionPathParamsSchema,
  gateExceptionSchema,
  gateImpactPathParamsSchema,
  requestGateExceptionSchema,
  servicePathParamsSchema,
} from "@hyrum/contracts";
import {
  approveGateException,
  GateExceptionError,
  getApiService,
  listGateExceptions,
  requestGateException,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

function serializeException(value: Awaited<ReturnType<typeof listGateExceptions>>[number]) {
  return {
    ...value,
    validFrom: value.validFrom.toISOString(),
    validUntil: value.validUntil.toISOString(),
    approvedAt: value.approvedAt?.toISOString() ?? null,
    usedAt: value.usedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
  };
}

function rethrowDomain(app: Parameters<FastifyPluginAsyncZod>[0], error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw app.httpErrors.conflict("An active exception already exists for this exact candidate");
  }
  if (!(error instanceof GateExceptionError)) throw error;
  if (error.code === "not_found") throw app.httpErrors.notFound(error.message);
  if (error.code === "conflict") throw app.httpErrors.conflict(error.message);
  throw app.httpErrors.unprocessableEntity(error.message);
}

export const gateExceptionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/gate-exceptions",
    {
      preHandler: app.requirePermission("gate:read"),
      schema: {
        tags: ["gates"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: gateExceptionListSchema },
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
      const records = await listGateExceptions(app.database.db, context.organizationId, service.id);
      return { data: records.map(serializeException) };
    },
  );

  app.post(
    "/gate-impacts/:gateImpactId/exception",
    {
      preHandler: app.requirePermission("gate:exception:request", { recentAuth: true }),
      schema: {
        tags: ["gates"],
        security: [{ bearerAuth: [] }],
        params: gateImpactPathParamsSchema,
        body: requestGateExceptionSchema,
        response: { 201: gateExceptionSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const created = await requestGateException(
          app.database.db,
          context.organizationId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
            recentAuthAt: new Date(),
          },
          request.params.gateImpactId,
          { reason: request.body.reason, validUntil: new Date(request.body.validUntil) },
        );
        const records = await listGateExceptions(
          app.database.db,
          context.organizationId,
          created.apiServiceId,
        );
        const record = records.find((value) => value.id === created.id);
        if (!record) throw new Error("Created gate exception could not be loaded");
        return reply.code(201).send(serializeException(record));
      } catch (error) {
        return rethrowDomain(app, error);
      }
    },
  );

  app.post(
    "/gate-exceptions/:gateExceptionId/approve",
    {
      preHandler: app.requirePermission("gate:exception:approve", { recentAuth: true }),
      schema: {
        tags: ["gates"],
        security: [{ bearerAuth: [] }],
        params: gateExceptionPathParamsSchema,
        response: { 200: gateExceptionSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        const approved = await approveGateException(
          app.database.db,
          context.organizationId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          request.params.gateExceptionId,
        );
        const reloaded = (
          await listGateExceptions(app.database.db, context.organizationId, approved.apiServiceId)
        ).find(({ id }) => id === request.params.gateExceptionId);
        if (!reloaded) throw app.httpErrors.notFound("Gate exception not found");
        return serializeException(reloaded);
      } catch (error) {
        return rethrowDomain(app, error);
      }
    },
  );
};
