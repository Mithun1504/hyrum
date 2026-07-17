import { createHash } from "node:crypto";
import {
  claimWebhookDelivery,
  finishWebhookDelivery,
  revokeWorkosMembership,
  syncWorkosInvitationState,
  syncWorkosMembership,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { productRole, workspaceSlug } from "../lib/workos";

interface WorkosWebhookOptions {
  webhookSecret: string | undefined;
}

export const workosWebhookRoutes: FastifyPluginAsyncZod<WorkosWebhookOptions> = async (
  app,
  options,
) => {
  app.post(
    "/webhooks/workos",
    {
      config: { rawBody: true },
      schema: {
        tags: ["webhooks"],
        headers: z.object({ "workos-signature": z.string().min(1) }).loose(),
        body: z.unknown(),
        response: {
          202: z.object({ received: z.literal(true), duplicate: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      if (!app.workos || !options.webhookSecret) {
        throw app.httpErrors.serviceUnavailable("WorkOS webhooks are not configured");
      }
      if (typeof request.rawBody !== "string") {
        throw app.httpErrors.badRequest("Raw webhook body is unavailable");
      }

      let event: Awaited<ReturnType<typeof app.workos.webhooks.constructEvent>>;
      try {
        event = await app.workos.webhooks.constructEvent({
          payload: request.rawBody,
          sigHeader: request.headers["workos-signature"],
          secret: options.webhookSecret,
        });
      } catch {
        throw app.httpErrors.unauthorized("Invalid WorkOS webhook signature");
      }

      const payloadDigest = createHash("sha256").update(request.rawBody).digest("hex");
      const claimed = await claimWebhookDelivery(app.database.sql, {
        provider: "workos",
        deliveryId: event.id,
        eventType: event.event,
        payloadDigest,
      });
      if (!claimed) return reply.code(202).send({ received: true, duplicate: true });

      let workosOrganizationId: string | null = null;
      let handled = false;
      try {
        if (
          event.event === "organization_membership.created" ||
          event.event === "organization_membership.updated"
        ) {
          const providerMembership = await app.workos.userManagement.getOrganizationMembership(
            event.data.id,
          );
          workosOrganizationId = providerMembership.organizationId;
          const user = await app.workos.userManagement.getUser(providerMembership.userId);
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
            lastAuthenticatedAt: new Date(0),
            workosMembershipId: providerMembership.id,
            role: productRole(providerMembership.role.slug),
            status:
              providerMembership.status === "active"
                ? "active"
                : providerMembership.status === "pending"
                  ? "invited"
                  : "suspended",
          });
          handled = true;
        } else if (event.event === "organization_membership.deleted") {
          workosOrganizationId = event.data.organizationId;
          await revokeWorkosMembership(app.database.sql, event.data.id);
          handled = true;
        } else if (
          event.event === "invitation.accepted" ||
          event.event === "invitation.created" ||
          event.event === "invitation.resent" ||
          event.event === "invitation.revoked"
        ) {
          const invitation = await app.workos.userManagement.getInvitation(event.data.id);
          workosOrganizationId = invitation.organizationId;
          await syncWorkosInvitationState(app.database.sql, {
            workosInvitationId: invitation.id,
            status: invitation.state,
            expiresAt: new Date(invitation.expiresAt),
            acceptedAt: invitation.acceptedAt ? new Date(invitation.acceptedAt) : null,
          });
          handled = true;
        }

        await finishWebhookDelivery(app.database.sql, {
          provider: "workos",
          deliveryId: event.id,
          workosOrganizationId,
          status: handled ? "processed" : "ignored",
          errorCode: null,
        });
        return reply.code(202).send({ received: true, duplicate: false });
      } catch (error) {
        await finishWebhookDelivery(app.database.sql, {
          provider: "workos",
          deliveryId: event.id,
          workosOrganizationId,
          status: "failed",
          errorCode: "WORKOS_RECONCILIATION_FAILED",
        });
        throw error;
      }
    },
  );
};
