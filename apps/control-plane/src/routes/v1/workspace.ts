import { workspaceSummarySchema } from "@hyrum/contracts";
import {
  behaviorObservations,
  captureSessions,
  consumers,
  eq,
  organizations,
  sql,
  withTenant,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { requireContext } from "./helpers";

export const workspaceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/workspace/summary",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["workspace"],
        security: [{ bearerAuth: [] }],
        response: { 200: workspaceSummarySchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const result = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [[organization], [capture]] = await Promise.all([
          tx
            .select({
              id: organizations.id,
              name: organizations.name,
              region: organizations.region,
              retentionDays: organizations.retentionDays,
            })
            .from(organizations)
            .where(eq(organizations.id, context.organizationId))
            .limit(1),
          tx
            .select({
              endpointCount: sql<number>`count(distinct ${behaviorObservations.operationId})::int`,
              evidenceEvents24h: sql<number>`count(distinct ${behaviorObservations.eventId}) filter (where ${behaviorObservations.lastSeenAt} >= now() - interval '24 hours')::int`,
              sessions24h: sql<number>`(select count(*) from ${captureSessions} where ${captureSessions.organizationId} = ${context.organizationId} and ${captureSessions.startedAt} >= now() - interval '24 hours')::int`,
              consumerCount: sql<number>`(select count(*) from ${consumers} where ${consumers.organizationId} = ${context.organizationId})::int`,
            })
            .from(behaviorObservations)
            .where(eq(behaviorObservations.organizationId, context.organizationId)),
        ]);
        if (!organization) throw app.httpErrors.notFound("Organization not found");
        return {
          organization: {
            id: organization.id,
            name: organization.name,
            region: organization.region,
            retention_days: organization.retentionDays,
          },
          capture: {
            endpoint_count: capture?.endpointCount ?? 0,
            consumer_count: capture?.consumerCount ?? 0,
            sessions_24h: capture?.sessions24h ?? 0,
            evidence_events_24h: capture?.evidenceEvents24h ?? 0,
          },
        };
      });
      return workspaceSummarySchema.parse(result);
    },
  );
};
