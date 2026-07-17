import { sessionResponseSchema } from "@hyrum/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { agentRoutes } from "./agents";
import { assertionRoutes } from "./assertions";
import { behaviorAdvisoryRoutes } from "./behavior-advisories";
import { corpusRoutes } from "./corpora";
import { eventRoutes } from "./events";
import { gateExceptionRoutes } from "./gate-exceptions";
import { gatePolicyRoutes } from "./gate-policies";
import { identityRoutes } from "./identity";
import { insightRoutes } from "./insights";
import { integrationRoutes } from "./integrations";
import { ledgerRoutes } from "./ledger";
import { memberRoutes } from "./members";
import { notificationRoutes } from "./notifications";
import { onboardingRoutes } from "./onboarding";
import { organizationRoutes } from "./organization";
import { privacyRoutes } from "./privacy";
import { replayRoutes } from "./replays";
import { reportingRoutes } from "./reporting";
import { searchRoutes } from "./search";
import { serviceRoutes } from "./services";
import { specificationRoutes } from "./specifications";

export const v1Routes: FastifyPluginAsyncZod = async (app) => {
  await app.register(agentRoutes);
  await app.register(assertionRoutes);
  await app.register(behaviorAdvisoryRoutes);
  await app.register(corpusRoutes);
  await app.register(identityRoutes);
  await app.register(insightRoutes);
  await app.register(integrationRoutes);
  await app.register(eventRoutes);
  await app.register(gateExceptionRoutes);
  await app.register(gatePolicyRoutes);
  await app.register(ledgerRoutes);
  await app.register(memberRoutes);
  await app.register(onboardingRoutes);
  await app.register(notificationRoutes);
  await app.register(organizationRoutes);
  await app.register(privacyRoutes);
  await app.register(replayRoutes);
  await app.register(reportingRoutes);
  await app.register(searchRoutes);
  await app.register(serviceRoutes);
  await app.register(specificationRoutes);
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
      const { actor, organizationId } = request.authContext;
      if (!actor.membershipId || !actor.role) throw app.httpErrors.forbidden();
      return {
        actorId: actor.actorId,
        organizationId,
        membershipId: actor.membershipId,
        role: actor.role,
        permissions: actor.permissions,
        recentlyAuthenticated: actor.recentlyAuthenticated,
      };
    },
  );
};
