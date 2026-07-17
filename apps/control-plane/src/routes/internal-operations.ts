import {
  createSupportGrantSchema,
  permissionSchema,
  platformHealthSchema,
  supportGrantPathSchema,
  supportGrantSchema,
} from "@hyrum/contracts";
import { approveSupportGrant, createSupportGrant, getPlatformHealth } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

type Grant = NonNullable<Awaited<ReturnType<typeof createSupportGrant>>>;

function serializeGrant(grant: Grant) {
  return {
    id: grant.id,
    organizationId: grant.organizationId,
    operatorId: grant.platformOperatorId,
    approvedByOperatorId: grant.approvedByOperatorId,
    reason: grant.reason,
    ticketReference: grant.ticketReference,
    scopes: permissionSchema.array().parse(grant.scopes),
    startsAt: grant.startsAt.toISOString(),
    expiresAt: grant.expiresAt.toISOString(),
    revokedAt: grant.revokedAt?.toISOString() ?? null,
  };
}

export const internalOperationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      preHandler: app.authenticateOperator("operations:read", false),
      schema: {
        tags: ["internal"],
        security: [{ bearerAuth: [] }],
        response: { 200: platformHealthSchema },
      },
    },
    async () => getPlatformHealth(app.database.db),
  );

  app.post(
    "/support-grants",
    {
      preHandler: app.authenticateOperator("support_grant:request"),
      schema: {
        tags: ["internal"],
        security: [{ bearerAuth: [] }],
        body: createSupportGrantSchema,
        response: { 201: supportGrantSchema },
      },
    },
    async (request, reply) => {
      if (!request.platformOperator) throw app.httpErrors.unauthorized();
      try {
        const grant = await createSupportGrant(
          app.database.db,
          request.platformOperator,
          request.id,
          request.body,
        );
        if (!grant) throw app.httpErrors.notFound("Organization not found");
        return reply.code(201).send(serializeGrant(grant));
      } catch (error) {
        if (error instanceof Error && error.message.includes("read-only")) {
          throw app.httpErrors.badRequest(error.message);
        }
        throw error;
      }
    },
  );

  app.post(
    "/support-grants/:grantId/approve",
    {
      preHandler: app.authenticateOperator("support_grant:approve"),
      schema: {
        tags: ["internal"],
        security: [{ bearerAuth: [] }],
        params: supportGrantPathSchema,
        response: { 200: supportGrantSchema },
      },
    },
    async (request) => {
      if (!request.platformOperator) throw app.httpErrors.unauthorized();
      const grant = await approveSupportGrant(
        app.database.db,
        request.platformOperator,
        request.id,
        request.params.grantId,
      );
      if (!grant) {
        throw app.httpErrors.conflict(
          "Grant is missing, expired, already approved, or cannot be self-approved",
        );
      }
      return serializeGrant(grant);
    },
  );
};
