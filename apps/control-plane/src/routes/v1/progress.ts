import { and, asc, eq, gt, progressEvents, withTenant } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { acquireProgressStream, startSingleFlightPolling } from "../../domain/progress-stream";
import { requireContext } from "./helpers";

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
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
          reply.raw.write(`data: ${JSON.stringify(row.payload)}\n\n`);
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
