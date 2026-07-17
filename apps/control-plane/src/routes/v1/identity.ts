import { identityOrganizationListSchema } from "@hyrum/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const identityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/me/organizations",
    {
      preHandler: app.authenticateIdentity,
      schema: {
        tags: ["identity"],
        security: [{ bearerAuth: [] }],
        response: { 200: identityOrganizationListSchema },
      },
    },
    async (request) => ({ data: await app.listIdentityOrganizations(request) }),
  );
};
