import {
  organizationSummarySchema,
  updateOrganizationRequestSchema,
  updateRetentionRequestSchema,
} from "@hyrum/contracts";
import {
  getOrganizationSummary,
  updateOrganizationRetention,
  updateOrganizationSettings,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const organizationRoutes: FastifyPluginAsyncZod = async (app) => {
  async function summary(organizationId: string) {
    const organization = await getOrganizationSummary(app.database.db, organizationId);
    if (!organization) throw app.httpErrors.notFound("Organization not found");
    return organization;
  }

  app.get(
    "/organization",
    {
      preHandler: app.requirePermission("organization:read"),
      schema: {
        tags: ["organization"],
        security: [{ bearerAuth: [] }],
        response: { 200: organizationSummarySchema },
      },
    },
    async (request) => {
      const organizationId = request.authContext?.organizationId;
      if (!organizationId) throw app.httpErrors.unauthorized();
      return summary(organizationId);
    },
  );

  app.patch(
    "/organization",
    {
      preHandler: app.requirePermission("organization:update"),
      schema: {
        tags: ["organization"],
        security: [{ bearerAuth: [] }],
        body: updateOrganizationRequestSchema,
        response: { 200: organizationSummarySchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      if (request.body.timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: request.body.timezone }).format();
        } catch {
          throw app.httpErrors.badRequest("Timezone must be a valid IANA timezone");
        }
      }
      try {
        await updateOrganizationSettings(
          app.database.db,
          context.organizationId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          request.body,
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23514"
        ) {
          throw app.httpErrors.conflict("Receipt TTL cannot exceed organization retention");
        }
        throw error;
      }
      return summary(context.organizationId);
    },
  );

  app.patch(
    "/organization/retention",
    {
      preHandler: app.requirePermission("privacy:manage", { recentAuth: true }),
      schema: {
        tags: ["organization", "privacy"],
        security: [{ bearerAuth: [] }],
        body: updateRetentionRequestSchema,
        response: { 200: organizationSummarySchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      try {
        await updateOrganizationRetention(
          app.database.db,
          context.organizationId,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          request.body,
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23514"
        ) {
          throw app.httpErrors.conflict("Retention cannot be shorter than the receipt TTL");
        }
        throw error;
      }
      return summary(context.organizationId);
    },
  );
};
