import {
  invitationPathParamsSchema,
  inviteMemberRequestSchema,
  memberDirectorySchema,
  memberPathParamsSchema,
  organizationInvitationSchema,
  organizationMemberSchema,
  transferOwnershipRequestSchema,
  updateMemberRoleRequestSchema,
  updateMemberStatusRequestSchema,
} from "@hyrum/contracts";
import {
  getInvitationProviderIdentity,
  getMemberProviderIdentity,
  listMemberDirectory,
  recordOrganizationInvitation,
  transferOrganizationOwnership,
  updateOrganizationInvitation,
  updateOrganizationMember,
} from "@hyrum/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

function actorFromRequest(request: FastifyRequest) {
  const context = getContext(request);
  if (!context.actor.membershipId || !context.actor.role)
    throw new Error("Missing membership actor");
  return {
    userId: context.actor.actorId,
    membershipId: context.actor.membershipId,
    role: context.actor.role,
    requestId: request.id,
  };
}

function getContext(request: FastifyRequest) {
  if (!request.authContext) throw new Error("Missing authenticated context");
  return request.authContext;
}

function memberMutationError(app: FastifyInstance, error: unknown): never {
  if (!(error instanceof Error)) throw error;
  if (error.message === "OWNER_MEMBER_REQUIRES_TRANSFER") {
    throw app.httpErrors.conflict("Owner changes require the ownership transfer flow");
  }
  if (error.message === "MEMBER_CANNOT_SUSPEND_SELF") {
    throw app.httpErrors.conflict("You cannot suspend your own membership");
  }
  if (error.message === "TARGET_MUST_BE_ACTIVE") {
    throw app.httpErrors.conflict("The new owner must have an active membership");
  }
  if (error.message === "TARGET_ALREADY_OWNER") {
    throw app.httpErrors.conflict("This membership already owns the organization");
  }
  throw error;
}

export const memberRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/members",
    {
      preHandler: app.requirePermission("member:read"),
      schema: {
        tags: ["members"],
        security: [{ bearerAuth: [] }],
        response: { 200: memberDirectorySchema },
      },
    },
    async (request) => {
      const context = getContext(request);
      return listMemberDirectory(app.database.db, context.organizationId);
    },
  );

  app.post(
    "/invitations",
    {
      preHandler: app.requirePermission("member:invite"),
      schema: {
        tags: ["members"],
        security: [{ bearerAuth: [] }],
        body: inviteMemberRequestSchema,
        response: { 201: organizationInvitationSchema },
      },
    },
    async (request, reply) => {
      const context = getContext(request);
      const workosOrganizationId = request.identityContext?.workosOrganizationId;
      if (!app.workos || !workosOrganizationId) {
        throw app.httpErrors.serviceUnavailable("WorkOS invitation management is not configured");
      }
      if (!context.actor.externalSubject) throw app.httpErrors.unauthorized();
      const providerInvitation = await app.workos.userManagement.sendInvitation({
        email: request.body.email,
        organizationId: workosOrganizationId,
        inviterUserId: context.actor.externalSubject,
        roleSlug: request.body.role,
        expiresInDays: request.body.expiresInDays,
      });
      try {
        const invitation = await recordOrganizationInvitation(
          app.database.db,
          context.organizationId,
          actorFromRequest(request),
          {
            email: providerInvitation.email,
            role: request.body.role,
            workosInvitationId: providerInvitation.id,
            expiresAt: new Date(providerInvitation.expiresAt),
            acceptedAt: providerInvitation.acceptedAt
              ? new Date(providerInvitation.acceptedAt)
              : null,
            status: providerInvitation.state,
          },
        );
        return reply.code(201).send(invitation);
      } catch (error) {
        await app.workos.userManagement
          .revokeInvitation(providerInvitation.id)
          .catch(() => undefined);
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw app.httpErrors.conflict("A pending invitation already exists for this email");
        }
        throw error;
      }
    },
  );

  app.post(
    "/invitations/:invitationId/resend",
    {
      preHandler: app.requirePermission("member:invite"),
      schema: {
        tags: ["members"],
        security: [{ bearerAuth: [] }],
        params: invitationPathParamsSchema,
        response: { 200: organizationInvitationSchema },
      },
    },
    async (request) => {
      const context = getContext(request);
      const local = await getInvitationProviderIdentity(
        app.database.db,
        context.organizationId,
        request.params.invitationId,
      );
      if (!local) throw app.httpErrors.notFound("Invitation not found");
      if (local.status !== "pending") {
        throw app.httpErrors.conflict("Only pending invitations can be resent");
      }
      if (!app.workos) throw app.httpErrors.serviceUnavailable("WorkOS is not configured");
      const provider = await app.workos.userManagement.resendInvitation(local.workosInvitationId);
      const updated = await updateOrganizationInvitation(
        app.database.db,
        context.organizationId,
        actorFromRequest(request),
        local.id,
        {
          status: provider.state,
          expiresAt: new Date(provider.expiresAt),
          acceptedAt: provider.acceptedAt ? new Date(provider.acceptedAt) : null,
        },
      );
      if (!updated) throw app.httpErrors.notFound("Invitation not found");
      return updated;
    },
  );

  app.delete(
    "/invitations/:invitationId",
    {
      preHandler: app.requirePermission("member:invite"),
      schema: {
        tags: ["members"],
        security: [{ bearerAuth: [] }],
        params: invitationPathParamsSchema,
        response: { 200: organizationInvitationSchema },
      },
    },
    async (request) => {
      const context = getContext(request);
      const local = await getInvitationProviderIdentity(
        app.database.db,
        context.organizationId,
        request.params.invitationId,
      );
      if (!local) throw app.httpErrors.notFound("Invitation not found");
      if (local.status !== "pending") {
        throw app.httpErrors.conflict("Only pending invitations can be revoked");
      }
      if (!app.workos) throw app.httpErrors.serviceUnavailable("WorkOS is not configured");
      const provider = await app.workos.userManagement.revokeInvitation(local.workosInvitationId);
      const updated = await updateOrganizationInvitation(
        app.database.db,
        context.organizationId,
        actorFromRequest(request),
        local.id,
        {
          status: provider.state,
          expiresAt: new Date(provider.expiresAt),
          acceptedAt: provider.acceptedAt ? new Date(provider.acceptedAt) : null,
        },
      );
      if (!updated) throw app.httpErrors.notFound("Invitation not found");
      return updated;
    },
  );

  app.patch(
    "/members/:membershipId/role",
    {
      preHandler: app.requirePermission("member:manage"),
      schema: {
        tags: ["members"],
        security: [{ bearerAuth: [] }],
        params: memberPathParamsSchema,
        body: updateMemberRoleRequestSchema,
        response: { 200: organizationMemberSchema },
      },
    },
    async (request) => {
      const context = getContext(request);
      const target = await getMemberProviderIdentity(
        app.database.db,
        context.organizationId,
        request.params.membershipId,
      );
      if (!target) throw app.httpErrors.notFound("Membership not found");
      if (target.role === "owner") {
        throw app.httpErrors.conflict("Owner changes require the ownership transfer flow");
      }
      if (!app.workos || !target.workosMembershipId) {
        throw app.httpErrors.serviceUnavailable("WorkOS membership management is unavailable");
      }
      await app.workos.userManagement.updateOrganizationMembership(target.workosMembershipId, {
        roleSlug: request.body.role,
      });
      try {
        const member = await updateOrganizationMember(
          app.database.db,
          context.organizationId,
          actorFromRequest(request),
          target.id,
          { role: request.body.role },
        );
        if (!member) throw app.httpErrors.notFound("Membership not found");
        return member;
      } catch (error) {
        await app.workos.userManagement
          .updateOrganizationMembership(target.workosMembershipId, { roleSlug: target.role })
          .catch(() => undefined);
        memberMutationError(app, error);
      }
    },
  );

  app.patch(
    "/members/:membershipId/status",
    {
      preHandler: app.requirePermission("member:manage"),
      schema: {
        tags: ["members"],
        security: [{ bearerAuth: [] }],
        params: memberPathParamsSchema,
        body: updateMemberStatusRequestSchema,
        response: { 200: organizationMemberSchema },
      },
    },
    async (request) => {
      const context = getContext(request);
      const target = await getMemberProviderIdentity(
        app.database.db,
        context.organizationId,
        request.params.membershipId,
      );
      if (!target) throw app.httpErrors.notFound("Membership not found");
      if (target.role === "owner") throw app.httpErrors.conflict("The owner cannot be suspended");
      if (request.body.status === "active") {
        if (!app.workos || !target.workosMembershipId) {
          throw app.httpErrors.serviceUnavailable("WorkOS membership validation is unavailable");
        }
        const providerMembership = await app.workos.userManagement.getOrganizationMembership(
          target.workosMembershipId,
        );
        if (providerMembership.status !== "active") {
          throw app.httpErrors.conflict("The WorkOS membership is not active");
        }
      }
      try {
        const member = await updateOrganizationMember(
          app.database.db,
          context.organizationId,
          actorFromRequest(request),
          target.id,
          { status: request.body.status },
        );
        if (!member) throw app.httpErrors.notFound("Membership not found");
        return member;
      } catch (error) {
        memberMutationError(app, error);
      }
    },
  );

  app.post(
    "/organization/transfer-ownership",
    {
      preHandler: app.requirePermission("organization:transfer", { recentAuth: true }),
      schema: {
        tags: ["organization", "members"],
        security: [{ bearerAuth: [] }],
        body: transferOwnershipRequestSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const context = getContext(request);
      const actor = actorFromRequest(request);
      const [currentOwner, target] = await Promise.all([
        getMemberProviderIdentity(app.database.db, context.organizationId, actor.membershipId),
        getMemberProviderIdentity(
          app.database.db,
          context.organizationId,
          request.body.targetMembershipId,
        ),
      ]);
      if (!currentOwner || !target) throw app.httpErrors.notFound("Membership not found");
      if (currentOwner.role !== "owner") throw app.httpErrors.forbidden();
      if (target.status !== "active") {
        throw app.httpErrors.conflict("The new owner must have an active membership");
      }
      if (!app.workos || !currentOwner.workosMembershipId || !target.workosMembershipId) {
        throw app.httpErrors.serviceUnavailable("WorkOS membership management is unavailable");
      }

      await app.workos.userManagement.updateOrganizationMembership(target.workosMembershipId, {
        roleSlug: "owner",
      });
      try {
        await app.workos.userManagement.updateOrganizationMembership(
          currentOwner.workosMembershipId,
          {
            roleSlug: "admin",
          },
        );
        await transferOrganizationOwnership(
          app.database.db,
          context.organizationId,
          actor,
          target.id,
        );
        return reply.code(204).send(null);
      } catch (error) {
        await Promise.allSettled([
          app.workos.userManagement.updateOrganizationMembership(target.workosMembershipId, {
            roleSlug: target.role,
          }),
          app.workos.userManagement.updateOrganizationMembership(currentOwner.workosMembershipId, {
            roleSlug: "owner",
          }),
        ]);
        memberMutationError(app, error);
      }
    },
  );
};
