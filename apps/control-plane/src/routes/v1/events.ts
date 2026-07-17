import { setTimeout as delay } from "node:timers/promises";
import { listLiveEvents } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const MAX_STREAM_MS = 25_000;
const HEARTBEAT_MS = 10_000;

export const eventRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/events", { preHandler: app.authenticateHuman }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw app.httpErrors.unauthorized();
    const requestedCursor = request.headers["last-event-id"];
    const initialCursor = Array.isArray(requestedCursor) ? requestedCursor[0] : requestedCursor;
    let cursor = initialCursor;
    let closed = false;
    request.raw.once("close", () => {
      closed = true;
    });
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write("retry: 2000\n\n");
    const startedAt = Date.now();
    let lastHeartbeatAt = startedAt;
    while (!closed && Date.now() - startedAt < MAX_STREAM_MS) {
      const events = await listLiveEvents(app.database.db, context.organizationId, cursor);
      for (const event of events) {
        if (closed) break;
        reply.raw.write(`id: ${event.id}\n`);
        reply.raw.write(`event: ${event.topic}\n`);
        reply.raw.write(
          `data: ${JSON.stringify({
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventVersion: event.eventVersion,
            occurredAt: event.createdAt.toISOString(),
          })}\n\n`,
        );
        cursor = event.id;
      }
      if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MS) {
        reply.raw.write(`: heartbeat ${new Date().toISOString()}\n\n`);
        lastHeartbeatAt = Date.now();
      }
      await delay(1_000);
    }
    if (!closed) reply.raw.end();
  });
};
