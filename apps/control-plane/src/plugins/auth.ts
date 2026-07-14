import type { OrganizationRole, RequestContext } from "@hyrum/contracts";
import fp from "fastify-plugin";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const claimsSchema = z.object({
  sub: z.string(),
  org_id: z.string(),
  role: z.enum(["owner", "admin", "engineer", "viewer"]).default("viewer"),
});

interface AuthPluginOptions {
  issuer: string | undefined;
  audience: string | undefined;
  jwksUrl: string | undefined;
}

export const authPlugin = fp<AuthPluginOptions>(async (app, options) => {
  app.decorate("authenticateHuman", async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized();
    if (!options.jwksUrl || !options.issuer || !options.audience) {
      throw app.httpErrors.serviceUnavailable("Human authentication is not configured");
    }

    const token = authorization.slice("Bearer ".length);
    const jwks = createRemoteJWKSet(new URL(options.jwksUrl));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: options.issuer,
      audience: options.audience,
    });
    const claims = claimsSchema.parse(payload);
    const context: RequestContext = {
      requestId: request.id,
      actorId: claims.sub,
      organizationId: claims.org_id,
      role: claims.role as OrganizationRole,
    };
    request.authContext = context;
  });
});
