import { progressEventListSchema, progressEventSchema } from "@hyrum/contracts";
import { and, asc, desc, eq, gt, progressEvents, withTenant } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { acquireProgressStream, startSingleFlightPolling } from "../../domain/progress-stream";
import { requireContext } from "./helpers";

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/progress",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["progress"],
        security: [{ bearerAuth: [] }],
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
        response: { 200: progressEventListSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const rows = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select()
          .from(progressEvents)
          .where(eq(progressEvents.organizationId, context.organizationId))
          .orderBy(desc(progressEvents.id))
          .limit(request.query.limit),
      );
      return {
        events: rows.reverse().map((row) =>
          progressEventSchema.parse({
            id: row.id,
            organization_id: row.organizationId,
            topic: row.topic,
            resource_id: row.resourceId,
            payload: row.payload,
            created_at: row.createdAt.toISOString(),
          }),
        ),
      };
    },
  );

  app.get(
    "/progress/stream",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["progress"],
        security: [{ bearerAuth: [] }],
        querystring: z.object({ last_event_id: z.coerce.number().int().nonnegative().default(0) }),
      },
    },
    async (request, reply) => {
      const context = requireContext(app, request.authContext);
      const release = acquireProgressStream();
      if (!release) throw app.httpErrors.serviceUnavailable("Progress stream capacity reached");
      let lastEventId = request.query.last_event_id;
      reply.hijack();
      reply.raw.writeHead(200, {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      });

      const sendEvents = async () => {
        const rows = await withTenant(app.database.db, context.organizationId, (tx) =>
          tx
            .select()
            .from(progressEvents)
            .where(
              and(
                eq(progressEvents.organizationId, context.organizationId),
                gt(progressEvents.id, lastEventId),
              ),
            )
            .orderBy(asc(progressEvents.id))
            .limit(100),
        );
        for (const row of rows) {
          lastEventId = row.id;
          reply.raw.write(`id: ${row.id}\n`);
          reply.raw.write(`event: ${row.topic}\n`);
          reply.raw.write(
            `data: ${JSON.stringify({ resource_id: row.resourceId, payload: row.payload, created_at: row.createdAt.toISOString() })}\n\n`,
          );
        }
      };

      let stop = () => {};
      const close = () => {
        stop();
        release();
      };
      request.raw.once("close", close);
      reply.raw.once("error", close);
      stop = startSingleFlightPolling(sendEvents, (error) => {
        request.log.error({ err: error }, "progress stream polling failed");
        reply.raw.destroy();
        close();
      });
    },
  );
};
