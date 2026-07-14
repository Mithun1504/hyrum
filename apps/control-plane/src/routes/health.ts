import { healthResponseSchema } from "@hyrum/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const errorSchema = z.object({ status: z.literal("degraded") });

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({
      service: "control-plane",
      status: "ok" as const,
      version: process.env.npm_package_version ?? "0.1.0",
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    "/ready",
    { schema: { tags: ["system"], response: { 200: healthResponseSchema, 503: errorSchema } } },
    async (_request, reply) => {
      try {
        await app.database.sql`select 1`;
        return {
          service: "control-plane",
          status: "ok" as const,
          version: process.env.npm_package_version ?? "0.1.0",
          timestamp: new Date().toISOString(),
        };
      } catch {
        return reply.code(503).send({ status: "degraded" });
      }
    },
  );
};
