import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export const v1Routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        tags: ["api"],
        response: {
          200: z.object({ name: z.literal("Hyrum Control Plane API"), version: z.literal("v1") }),
        },
      },
    },
    async () => ({ name: "Hyrum Control Plane API" as const, version: "v1" as const }),
  );

  app.get(
    "/session",
    {
      preHandler: app.authenticateHuman,
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({ actorId: z.string(), organizationId: z.string(), role: z.string() }),
        },
      },
    },
    async (request) => {
      if (!request.authContext) throw app.httpErrors.unauthorized();
      return request.authContext;
    },
  );
};
