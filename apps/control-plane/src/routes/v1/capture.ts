import { captureBatchResponseSchema, captureBatchSchema } from "@hyrum/contracts";
import { and, captureBatches, eq, organizations, withTenant } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  enqueueCaptureFollowup,
  ensureEventTenant,
  ingestCaptureEvent,
} from "../../domain/ingestion";

export const captureRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/capture/batches",
    {
      // This route alone accepts the contract maximum of 1,000 already-redacted events.
      bodyLimit: 8 * 1_048_576,
      preHandler: app.requireMachineScope("capture:write"),
      schema: {
        tags: ["capture"],
        security: [{ bearerAuth: [] }],
        body: captureBatchSchema,
        response: { 200: captureBatchResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.agentId) throw app.httpErrors.unauthorized();
      const agentId = context.agentId;

      const [existing] = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select({ response: captureBatches.response })
          .from(captureBatches)
          .where(
            and(
              eq(captureBatches.organizationId, context.organizationId),
              eq(captureBatches.agentId, agentId),
              eq(captureBatches.batchId, request.body.batch_id),
            ),
          )
          .limit(1),
      );
      if (existing) return captureBatchResponseSchema.parse(existing.response);

      const [organization] = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select({ retentionDays: organizations.retentionDays })
          .from(organizations)
          .where(eq(organizations.id, context.organizationId))
          .limit(1),
      );
      if (!organization) throw app.httpErrors.forbidden();

      const results = [];
      for (const event of request.body.events) {
        if (!ensureEventTenant(context.organizationId, event)) {
          results.push({
            event_id: event.event_id,
            status: "rejected" as const,
            code: "tenant_mismatch",
            error: "Event organization_id does not match the machine credential tenant",
          });
          continue;
        }
        try {
          const status = await ingestCaptureEvent(
            app.database.db,
            context.organizationId,
            event,
            organization.retentionDays,
            {
              objectStorage: app.objectStorage,
              onError: (error) =>
                request.log.warn(
                  { err: error, eventId: event.event_id },
                  "receipt object storage unavailable; metadata retained",
                ),
            },
          );
          results.push({ event_id: event.event_id, status });
        } catch (error) {
          request.log.warn(
            { err: error, eventId: event.event_id, organizationId: context.organizationId },
            "capture event rejected",
          );
          results.push({
            event_id: event.event_id,
            status: "rejected" as const,
            code: "ingestion_failed",
            error: "Capture event could not be persisted",
          });
        }
      }

      const response = captureBatchResponseSchema.parse({
        batch_id: request.body.batch_id,
        accepted_count: results.filter((item) => item.status !== "rejected").length,
        rejected_count: results.filter((item) => item.status === "rejected").length,
        results,
      });

      await withTenant(app.database.db, context.organizationId, async (tx) => {
        await tx
          .insert(captureBatches)
          .values({
            organizationId: context.organizationId,
            agentId,
            batchId: request.body.batch_id,
            response,
          })
          .onConflictDoNothing({
            target: [captureBatches.organizationId, captureBatches.agentId, captureBatches.batchId],
          });
        await enqueueCaptureFollowup(
          tx,
          context.organizationId,
          request.body.batch_id,
          `${agentId}:${request.body.batch_id}`,
          response,
        );
      });
      return response;
    },
  );
};
