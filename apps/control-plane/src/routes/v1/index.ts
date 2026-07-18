import { sessionResponseSchema } from "@hyrum/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assertionRoutes } from "./assertions";
import { captureRoutes } from "./capture";
import { ledgerRoutes } from "./ledger";
import { policyRoutes } from "./policies";
import { progressRoutes } from "./progress";
import { replayRoutes } from "./replay";
import { specDraftRoutes } from "./spec-drafts";
import { specRoutes } from "./specs";
import { workspaceRoutes } from "./workspace";

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
          200: sessionResponseSchema,
        },
      },
    },
    async (request) => {
      if (!request.authContext) throw app.httpErrors.unauthorized();
      return request.authContext;
    },
  );

  await app.register(captureRoutes);
  await app.register(ledgerRoutes);
  await app.register(assertionRoutes);
  await app.register(policyRoutes);
  await app.register(replayRoutes);
  await app.register(specRoutes);
  await app.register(specDraftRoutes);
  await app.register(progressRoutes);
  await app.register(workspaceRoutes);
};
