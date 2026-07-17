import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  jobs,
  notificationDeliveries,
  notificationRoutes,
  notifications,
  slackInstallations,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";

const severityRank = { info: 0, warning: 1, critical: 2 } as const;

/** Expand one persisted intent into idempotent, independently retryable channel deliveries. */
export async function routeNotification(
  tx: DatabaseTransaction,
  organizationId: string,
  notificationId: string,
): Promise<number> {
  const [notification] = await tx
    .select({
      id: notifications.id,
      eventType: notifications.eventType,
      severity: notifications.severity,
      apiServiceId: notifications.apiServiceId,
    })
    .from(notifications)
    .where(
      and(eq(notifications.organizationId, organizationId), eq(notifications.id, notificationId)),
    )
    .limit(1);
  if (!notification) return 0;
  const routes = await tx
    .select({ id: notificationRoutes.id, minimumSeverity: notificationRoutes.minimumSeverity })
    .from(notificationRoutes)
    .innerJoin(
      slackInstallations,
      and(
        eq(slackInstallations.organizationId, notificationRoutes.organizationId),
        eq(slackInstallations.id, notificationRoutes.slackInstallationId),
        eq(slackInstallations.status, "active"),
      ),
    )
    .where(
      and(
        eq(notificationRoutes.organizationId, organizationId),
        eq(notificationRoutes.channel, "slack"),
        eq(notificationRoutes.enabled, true),
        or(
          eq(notificationRoutes.eventType, notification.eventType),
          eq(notificationRoutes.eventType, "*"),
        ),
        notification.apiServiceId
          ? or(
              isNull(notificationRoutes.apiServiceId),
              eq(notificationRoutes.apiServiceId, notification.apiServiceId),
            )
          : isNull(notificationRoutes.apiServiceId),
      ),
    );
  let created = 0;
  for (const route of routes) {
    if (severityRank[notification.severity] < severityRank[route.minimumSeverity]) continue;
    const [delivery] = await tx
      .insert(notificationDeliveries)
      .values({
        organizationId,
        notificationId,
        notificationRouteId: route.id,
        channel: "slack",
        nextAttemptAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: notificationDeliveries.id });
    if (!delivery) continue;
    await tx.insert(jobs).values({
      organizationId,
      type: "deliver_slack_notification",
      payload: { notificationDeliveryId: delivery.id },
      idempotencyKey: `deliver-slack-notification:${delivery.id}`,
      concurrencyKey: `slack:${route.id}`,
      maxAttempts: 5,
    });
    created += 1;
  }
  return created;
}

export async function prepareSlackNotificationDelivery(
  tx: DatabaseTransaction,
  organizationId: string,
  deliveryId: string,
) {
  const [delivery] = await tx
    .select({
      id: notificationDeliveries.id,
      status: notificationDeliveries.status,
      encryptedBotToken: slackInstallations.encryptedBotToken,
      channelId: notificationRoutes.destinationId,
      title: notifications.title,
      bodyText: notifications.bodyText,
      deepLinkPath: notifications.deepLinkPath,
    })
    .from(notificationDeliveries)
    .innerJoin(
      notificationRoutes,
      and(
        eq(notificationRoutes.organizationId, notificationDeliveries.organizationId),
        eq(notificationRoutes.id, notificationDeliveries.notificationRouteId),
      ),
    )
    .innerJoin(
      slackInstallations,
      and(
        eq(slackInstallations.organizationId, notificationRoutes.organizationId),
        eq(slackInstallations.id, notificationRoutes.slackInstallationId),
        eq(slackInstallations.status, "active"),
      ),
    )
    .innerJoin(
      notifications,
      and(
        eq(notifications.organizationId, notificationDeliveries.organizationId),
        eq(notifications.id, notificationDeliveries.notificationId),
      ),
    )
    .where(
      and(
        eq(notificationDeliveries.organizationId, organizationId),
        eq(notificationDeliveries.id, deliveryId),
      ),
    )
    .limit(1);
  if (!delivery || delivery.status === "sent" || delivery.status === "cancelled") return null;
  if (!delivery.channelId) throw new Error("Slack delivery has no channel destination");
  await tx
    .update(notificationDeliveries)
    .set({ attempts: sql`${notificationDeliveries.attempts} + 1`, lastErrorCode: null })
    .where(
      and(
        eq(notificationDeliveries.organizationId, organizationId),
        eq(notificationDeliveries.id, deliveryId),
      ),
    );
  return { ...delivery, channelId: delivery.channelId };
}

export async function markSlackNotificationSent(
  tx: DatabaseTransaction,
  organizationId: string,
  deliveryId: string,
  providerMessageId: string,
): Promise<void> {
  const now = new Date();
  await tx
    .update(notificationDeliveries)
    .set({
      status: "sent",
      providerMessageId,
      sentAt: now,
      nextAttemptAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationDeliveries.organizationId, organizationId),
        eq(notificationDeliveries.id, deliveryId),
      ),
    );
}
