import {
  type OrganizationRole,
  organizationRoleSchema,
  type Permission,
  type RequestContext,
  roleHasPermission,
} from "@hyrum/contracts";
import {
  agents,
  and,
  eq,
  isNull,
  memberships,
  organizations,
  users,
  withHumanAuthLookup,
  withMachineAuthLookup,
} from "@hyrum/db";
import type { WorkOS } from "@workos-inc/node";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  hashMachineToken,
  machineTokenHashNeedsRotation,
  machineTokenPrefix,
  verifyMachineToken,
} from "../domain/security";

const claimsSchema = z.object({
  sub: z.string(),
  org_id: z.string(),
  client_id: z.string(),
});

const workosMembershipSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  status: z.string(),
  role: z.object({ slug: z.string() }),
});

const workosIdentitySchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.email(),
    name: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  }),
  organization: z.object({ id: z.string(), name: z.string().min(1) }),
  membership: workosMembershipSchema,
});

const workosMembershipListSchema = z.object({ data: z.array(workosMembershipSchema) });

type WorkosMembership = z.infer<typeof workosMembershipSchema>;

type HumanMembership = {
  actorId: string;
  organizationId: string;
  role: OrganizationRole;
};

type WorkosIdentityClient = Pick<WorkOS, "organizations" | "userManagement">;

interface AuthPluginOptions {
  clientId: string | undefined;
  issuer?: string | undefined;
  jwksUrl: string | undefined;
  workos?: WorkosIdentityClient | undefined;
}

const defaultWorkosIssuer = "https://api.workos.com/";
const membershipVerificationTtlMs = 45_000;
const membershipVerificationCacheMaxEntries = 10_000;

function initialOrganizationRole(workosRole: string): OrganizationRole {
  if (workosRole === "member") return "engineer";
  const parsedRole = organizationRoleSchema.safeParse(workosRole);
  return parsedRole.success ? parsedRole.data : "viewer";
}

function workosJwksUrl(clientId: string) {
  const url = new URL(defaultWorkosIssuer);
  url.pathname = `/sso/jwks/${encodeURIComponent(clientId)}`;
  return url;
}

async function findHumanMembership(
  app: FastifyInstance,
  workosUserId: string,
  workosOrganizationId: string,
): Promise<HumanMembership | undefined> {
  const [membership] = await withHumanAuthLookup(
    app.database.db,
    workosUserId,
    workosOrganizationId,
    (tx) =>
      tx
        .select({
          actorId: users.id,
          organizationId: organizations.id,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .where(
          and(
            eq(users.workosUserId, workosUserId),
            eq(organizations.workosOrganizationId, workosOrganizationId),
            eq(organizations.active, true),
          ),
        )
        .limit(1),
  );
  return membership as HumanMembership | undefined;
}

async function provisionHumanMembership(
  app: FastifyInstance,
  workos: WorkosIdentityClient,
  workosUserId: string,
  workosOrganizationId: string,
  remoteMembership: WorkosMembership,
): Promise<HumanMembership | undefined> {
  const [user, organization] = await Promise.all([
    workos.userManagement.getUser(workosUserId),
    workos.organizations.getOrganization(workosOrganizationId),
  ]);
  const identity = workosIdentitySchema.parse({
    user,
    organization,
    membership: remoteMembership,
  });
  if (
    identity.user.id !== workosUserId ||
    identity.organization.id !== workosOrganizationId ||
    identity.membership.userId !== workosUserId ||
    identity.membership.organizationId !== workosOrganizationId
  ) {
    return undefined;
  }

  const initialRole = initialOrganizationRole(identity.membership.role.slug);
  const derivedName = [identity.user.firstName, identity.user.lastName].filter(Boolean).join(" ");
  const displayName = identity.user.name ?? (derivedName || null);

  return withHumanAuthLookup(app.database.db, workosUserId, workosOrganizationId, async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({
        workosOrganizationId,
        name: identity.organization.name,
      })
      .onConflictDoUpdate({
        target: organizations.workosOrganizationId,
        set: { name: identity.organization.name },
      })
      .returning({ id: organizations.id, active: organizations.active });
    if (!organization?.active) return undefined;

    const [user] = await tx
      .insert(users)
      .values({
        workosUserId,
        email: identity.user.email,
        displayName,
      })
      .onConflictDoUpdate({
        target: users.workosUserId,
        set: { email: identity.user.email, displayName },
      })
      .returning({ id: users.id });
    if (!user) throw new Error("Failed to synchronize WorkOS user");

    const [createdMembership] = await tx
      .insert(memberships)
      .values({ organizationId: organization.id, userId: user.id, role: initialRole })
      .onConflictDoNothing()
      .returning({
        actorId: memberships.userId,
        organizationId: memberships.organizationId,
        role: memberships.role,
      });
    if (createdMembership) return createdMembership as HumanMembership;

    const [existingMembership] = await tx
      .select({
        actorId: memberships.userId,
        organizationId: memberships.organizationId,
        role: memberships.role,
      })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organization.id), eq(memberships.userId, user.id)))
      .limit(1);
    return existingMembership as HumanMembership | undefined;
  });
}

export const authPlugin = fp<AuthPluginOptions>(async (app, options) => {
  const clientId = options.clientId;
  const issuer = new URL(options.issuer ?? defaultWorkosIssuer).href;
  const acceptedIssuers = [issuer, issuer.endsWith("/") ? issuer.slice(0, -1) : `${issuer}/`];
  const jwksUrl = options.jwksUrl ? new URL(options.jwksUrl) : clientId && workosJwksUrl(clientId);
  const jwks = jwksUrl ? createRemoteJWKSet(jwksUrl) : undefined;
  const workos = options.workos;
  const membershipVerificationCache = new Map<
    string,
    { expiresAt: number; membership: Promise<WorkosMembership | undefined> }
  >();

  async function getActiveWorkosMembership(workosUserId: string, workosOrganizationId: string) {
    if (!workos) {
      throw app.httpErrors.serviceUnavailable("WorkOS membership verification is not configured");
    }
    const cacheKey = `${workosUserId}\u0000${workosOrganizationId}`;
    const cached = membershipVerificationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.membership;
    if (cached) membershipVerificationCache.delete(cacheKey);
    if (membershipVerificationCache.size >= membershipVerificationCacheMaxEntries) {
      const oldestKey = membershipVerificationCache.keys().next().value;
      if (oldestKey !== undefined) membershipVerificationCache.delete(oldestKey);
    }

    const membership = workos.userManagement
      .listOrganizationMemberships({
        organizationId: workosOrganizationId,
        userId: workosUserId,
        statuses: ["active"],
        limit: 1,
      })
      .then((result) => {
        const parsed = workosMembershipListSchema.parse(result);
        return parsed.data.find(
          (candidate) =>
            candidate.status === "active" &&
            candidate.userId === workosUserId &&
            candidate.organizationId === workosOrganizationId,
        );
      });
    const entry = { expiresAt: Date.now() + membershipVerificationTtlMs, membership };
    membershipVerificationCache.set(cacheKey, entry);
    void membership.catch(() => {
      if (membershipVerificationCache.get(cacheKey) === entry) {
        membershipVerificationCache.delete(cacheKey);
      }
    });
    return membership;
  }

  app.decorate("authenticateHuman", async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized();
    if (!jwks || !clientId) {
      throw app.httpErrors.serviceUnavailable("Human authentication is not configured");
    }
    if (!workos) {
      throw app.httpErrors.serviceUnavailable("WorkOS membership verification is not configured");
    }

    const token = authorization.slice("Bearer ".length);
    let claims: z.infer<typeof claimsSchema>;
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer: acceptedIssuers });
      claims = claimsSchema.parse(payload);
    } catch {
      throw app.httpErrors.unauthorized("Invalid WorkOS session token");
    }
    if (claims.client_id !== clientId) {
      throw app.httpErrors.unauthorized("Invalid WorkOS session token");
    }
    let remoteMembership: WorkosMembership | undefined;
    try {
      remoteMembership = await getActiveWorkosMembership(claims.sub, claims.org_id);
    } catch {
      request.log.warn("WorkOS membership verification failed");
      throw app.httpErrors.serviceUnavailable("WorkOS membership verification failed");
    }
    if (!remoteMembership) {
      throw app.httpErrors.forbidden("No active WorkOS organization membership");
    }

    let membership = await findHumanMembership(app, claims.sub, claims.org_id);
    if (!membership) {
      try {
        membership = await provisionHumanMembership(
          app,
          workos,
          claims.sub,
          claims.org_id,
          remoteMembership,
        );
      } catch {
        request.log.warn("WorkOS identity provisioning failed");
        throw app.httpErrors.serviceUnavailable("WorkOS identity provisioning failed");
      }
    }
    if (!membership) throw app.httpErrors.forbidden("No active Hyrum organization membership");
    const context: RequestContext = {
      requestId: request.id,
      actorId: membership.actorId,
      organizationId: membership.organizationId,
      role: membership.role as OrganizationRole,
    };
    request.authContext = context;
  });

  app.decorate("authenticateMachine", async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized();
    const token = authorization.slice("Bearer ".length);
    const prefix = machineTokenPrefix(token);
    if (!prefix) throw app.httpErrors.unauthorized();

    const [agent] = await withMachineAuthLookup(app.database.db, prefix, (tx) =>
      tx
        .select({
          id: agents.id,
          organizationId: agents.organizationId,
          tokenHash: agents.tokenHash,
          scopes: agents.scopes,
        })
        .from(agents)
        .where(and(eq(agents.tokenPrefix, prefix), isNull(agents.revokedAt)))
        .limit(1),
    );

    if (!agent || !(await verifyMachineToken(token, agent.tokenHash))) {
      throw app.httpErrors.unauthorized();
    }

    await withMachineAuthLookup(app.database.db, prefix, async (tx) => {
      await tx
        .update(agents)
        .set({
          lastSeenAt: new Date(),
          ...(machineTokenHashNeedsRotation(agent.tokenHash)
            ? { tokenHash: await hashMachineToken(token) }
            : {}),
        })
        .where(eq(agents.id, agent.id));
    });

    request.authContext = {
      requestId: request.id,
      actorId: agent.id,
      organizationId: agent.organizationId,
      role: "engineer" as OrganizationRole,
      agentId: agent.id,
      scopes: agent.scopes,
    };
  });

  app.decorate("requireMachineScope", (scope) => async (request) => {
    await app.authenticateMachine(request);
    if (!request.authContext?.scopes?.includes(scope)) throw app.httpErrors.forbidden();
  });

  app.decorate("requireHumanPermission", (permission: Permission) => async (request) => {
    await app.authenticateHuman(request);
    if (!request.authContext || !roleHasPermission(request.authContext.role, permission)) {
      throw app.httpErrors.forbidden();
    }
  });
});
