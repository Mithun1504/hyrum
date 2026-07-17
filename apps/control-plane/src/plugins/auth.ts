import {
  type IdentityOrganization,
  type Permission,
  permissionsForRole,
  type RequestContext,
} from "@hyrum/contracts";
import {
  listHumanOrganizations,
  resolveActiveSupportAccess,
  resolveHumanMembership,
  resolvePlatformOperator,
  syncWorkosMembership,
} from "@hyrum/db";
import { WorkOS } from "@workos-inc/node";
import fp from "fastify-plugin";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { productRole, workspaceSlug } from "../lib/workos";

const claimsSchema = z.object({
  sub: z.string(),
  org_id: z.string().optional(),
  auth_time: z.number().int().optional(),
  iat: z.number().int().optional(),
});

interface AuthPluginOptions {
  issuer: string | undefined;
  audience: string | undefined;
  jwksUrl: string | undefined;
  workosApiKey: string | undefined;
}

export const authPlugin = fp<AuthPluginOptions>(async (app, options) => {
  const jwks = options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : undefined;
  const workos = options.workosApiKey ? new WorkOS(options.workosApiKey) : undefined;
  app.decorate("workos", workos ?? null);

  app.decorate("authenticateIdentity", async (request) => {
    if (request.identityContext) return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized();
    if (!jwks || !options.issuer || !options.audience) {
      throw app.httpErrors.serviceUnavailable("Human authentication is not configured");
    }

    try {
      const token = authorization.slice("Bearer ".length);
      const { payload } = await jwtVerify(token, jwks, {
        issuer: options.issuer,
        audience: options.audience,
      });
      const claims = claimsSchema.parse(payload);
      const authenticatedAt = claims.auth_time ?? claims.iat;
      request.identityContext = {
        requestId: request.id,
        externalSubject: claims.sub,
        workosOrganizationId: claims.org_id,
        recentlyAuthenticated:
          authenticatedAt !== undefined && Date.now() / 1_000 - authenticatedAt <= 10 * 60,
      };
    } catch {
      throw app.httpErrors.unauthorized("The bearer token is invalid or expired");
    }
  });

  app.decorate("authenticateHuman", async (request) => {
    await app.authenticateIdentity(request);
    const identity = request.identityContext;
    if (!identity) throw app.httpErrors.unauthorized();
    const supportGrantHeader = request.headers["x-hyrum-support-grant"];
    if (typeof supportGrantHeader === "string") {
      const grantId = z.uuid().safeParse(supportGrantHeader);
      if (!grantId.success) throw app.httpErrors.forbidden("Support grant header is invalid");
      const grant = await resolveActiveSupportAccess(
        app.database.db,
        identity.externalSubject,
        grantId.data,
      );
      if (!grant || grant.scopes.length === 0) {
        throw app.httpErrors.forbidden("Support grant is missing, unapproved, expired, or revoked");
      }
      request.authContext = {
        requestId: request.id,
        organizationId: grant.organizationId,
        actor: {
          actorId: grant.userId,
          principalType: "platform_operator",
          externalSubject: identity.externalSubject,
          permissions: grant.scopes,
          recentlyAuthenticated: identity.recentlyAuthenticated,
          supportAccessGrantId: grant.grantId,
        },
      };
      request.platformOperator = {
        id: grant.operatorId,
        userId: grant.userId,
        capabilities: [],
      };
      return;
    }
    if (!identity.workosOrganizationId) {
      throw app.httpErrors.forbidden("Select an organization before accessing this resource");
    }

    let membership = await resolveHumanMembership(
      app.database.sql,
      identity.externalSubject,
      identity.workosOrganizationId,
    );
    if (!membership && workos) {
      const [organization, user, membershipPage] = await Promise.all([
        workos.organizations.getOrganization(identity.workosOrganizationId),
        workos.userManagement.getUser(identity.externalSubject),
        workos.userManagement.listOrganizationMemberships({
          organizationId: identity.workosOrganizationId,
          userId: identity.externalSubject,
          statuses: ["active"],
          limit: 1,
        }),
      ]);
      const workosMembership = membershipPage.data[0];
      if (workosMembership) {
        membership = await syncWorkosMembership(app.database.sql, {
          workosOrganizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: workspaceSlug(organization.name, organization.id),
          workosUserId: user.id,
          userEmail: user.email,
          userDisplayName: user.name,
          userAvatarUrl: user.profilePictureUrl,
          lastAuthenticatedAt: new Date(),
          workosMembershipId: workosMembership.id,
          role: productRole(workosMembership.role.slug),
          status: "active",
        });
      }
    }
    if (!membership) {
      throw app.httpErrors.forbidden("No active Hyrum membership exists for this organization");
    }

    const context: RequestContext = {
      requestId: request.id,
      organizationId: membership.organizationId,
      actor: {
        actorId: membership.userId,
        principalType: "human",
        externalSubject: identity.externalSubject,
        membershipId: membership.membershipId,
        role: membership.role,
        permissions: [...permissionsForRole(membership.role)],
        recentlyAuthenticated: identity.recentlyAuthenticated,
      },
    };
    request.authContext = context;
  });

  app.decorate("authenticateOperator", (capability: string, requireRecentAuth = true) => {
    return async (request) => {
      await app.authenticateIdentity(request);
      const identity = request.identityContext;
      if (!identity) throw app.httpErrors.unauthorized();
      const operator = await resolvePlatformOperator(app.database.db, identity.externalSubject);
      if (!operator?.capabilities.includes(capability)) {
        throw app.httpErrors.forbidden("Platform operator capability is required");
      }
      if (requireRecentAuth && !identity.recentlyAuthenticated) {
        throw app.httpErrors.forbidden("Recent authentication is required for this action");
      }
      request.platformOperator = operator;
    };
  });

  app.decorate("listIdentityOrganizations", async (request): Promise<IdentityOrganization[]> => {
    await app.authenticateIdentity(request);
    const identity = request.identityContext;
    if (!identity) throw app.httpErrors.unauthorized();

    if (workos) {
      const [user, membershipPage] = await Promise.all([
        workos.userManagement.getUser(identity.externalSubject),
        workos.userManagement.listOrganizationMemberships({
          userId: identity.externalSubject,
          statuses: ["active"],
        }),
      ]);
      const providerMemberships = await membershipPage.autoPagination();
      for (const providerMembership of providerMemberships) {
        await syncWorkosMembership(app.database.sql, {
          workosOrganizationId: providerMembership.organizationId,
          organizationName: providerMembership.organizationName,
          organizationSlug: workspaceSlug(
            providerMembership.organizationName,
            providerMembership.organizationId,
          ),
          workosUserId: user.id,
          userEmail: user.email,
          userDisplayName: user.name,
          userAvatarUrl: user.profilePictureUrl,
          lastAuthenticatedAt: new Date(),
          workosMembershipId: providerMembership.id,
          role: productRole(providerMembership.role.slug),
          status: "active",
        });
      }
    }

    return listHumanOrganizations(app.database.sql, identity.externalSubject);
  });

  app.decorate("requirePermission", (permission: Permission, options = {}) => {
    return async (request) => {
      await app.authenticateHuman(request);
      const context = request.authContext;
      if (!context?.actor.permissions.includes(permission)) {
        throw app.httpErrors.forbidden("You do not have permission to perform this action");
      }
      if (options.recentAuth && !context.actor.recentlyAuthenticated) {
        throw app.httpErrors.forbidden("Recent authentication is required for this action");
      }
    };
  });
});
