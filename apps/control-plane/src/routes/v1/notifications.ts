import {
  notificationInboxSchema,
  notificationPathParamsSchema,
  notificationPreferenceListSchema,
  notificationPreferencePathParamsSchema,
  notificationPreferenceSchema,
  notificationSchema,
  updateNotificationPreferenceSchema,
} from "@hyrum/contracts";
import {
  dismissNotification,
  listNotificationPreferences,
  listNotifications,
  markNotificationRead,
  updateNotificationPreference,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

function serialize(record: Awaited<ReturnType<typeof listNotifications>>["data"][number]) {
  return {
    ...record,
    readAt: record.readAt?.toISOString() ?? null,
    dismissedAt: record.dismissedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/notification-preferences",
    {
      preHandler: app.authenticateHuman,
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        response: { 200: notificationPreferenceListSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const data = await listNotificationPreferences(
        app.database.db,
        context.organizationId,
        context.actor.membershipId,
      );
      return {
        data: data.map((preference) => ({
          ...preference,
          mutedUntil: preference.mutedUntil?.toISOString() ?? null,
          updatedAt: preference.updatedAt?.toISOString() ?? null,
        })),
      };
    },
  );

  app.put(
    "/notification-preferences/:eventType",
    {
      preHandler: app.authenticateHuman,
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: notificationPreferencePathParamsSchema,
        body: updateNotificationPreferenceSchema,
        response: { 200: notificationPreferenceSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const preference = await updateNotificationPreference(
        app.database.db,
        context.organizationId,
        context.actor.membershipId,
        request.params.eventType,
        {
          ...request.body,
          mutedUntil: request.body.mutedUntil ? new Date(request.body.mutedUntil) : null,
        },
        { userId: context.actor.actorId, requestId: request.id },
      );
      if (!preference) throw app.httpErrors.notFound("Notification event type not found");
      return {
        ...preference,
        mutedUntil: preference.mutedUntil?.toISOString() ?? null,
        updatedAt: preference.updatedAt.toISOString(),
      };
    },
  );

  app.get(
    "/notifications",
    {
      preHandler: app.authenticateHuman,
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        response: { 200: notificationInboxSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const inbox = await listNotifications(
        app.database.db,
        context.organizationId,
        context.actor.membershipId,
      );
      return { data: inbox.data.map(serialize), unreadCount: inbox.unreadCount };
    },
  );

  app.post(
    "/notifications/:notificationId/read",
    {
      preHandler: app.authenticateHuman,
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: notificationPathParamsSchema,
        response: { 200: notificationSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const updated = await markNotificationRead(
        app.database.db,
        context.organizationId,
        context.actor.membershipId,
        request.params.notificationId,
        { userId: context.actor.actorId, requestId: request.id },
      );
      if (!updated) throw app.httpErrors.notFound("Notification not found");
      const inbox = await listNotifications(
        app.database.db,
        context.organizationId,
        context.actor.membershipId,
      );
      const record = inbox.data.find(({ id }) => id === request.params.notificationId);
      if (!record) throw app.httpErrors.notFound("Notification not found");
      return serialize(record);
    },
  );

  app.delete(
    "/notifications/:notificationId",
    {
      preHandler: app.authenticateHuman,
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: notificationPathParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const dismissed = await dismissNotification(
        app.database.db,
        context.organizationId,
        context.actor.membershipId,
        request.params.notificationId,
        { userId: context.actor.actorId, requestId: request.id },
      );
      if (!dismissed) throw app.httpErrors.notFound("Notification not found");
      return reply.code(204).send(null);
    },
  );
};
