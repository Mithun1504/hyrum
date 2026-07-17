import type { NotificationEventType } from "@hyrum/contracts";
import { and, count, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { Database } from "./index";
import { auditEvents, notificationPreferences, notifications } from "./schema";
import { withOrganizationContext } from "./tenancy";

export const notificationEventCatalog = [
  { eventType: "gate.block", label: "Blocked replay gates", mandatory: false },
  { eventType: "gate.warn", label: "Replay gate warnings", mandatory: false },
  { eventType: "assertion.expiring", label: "Assertions nearing expiry", mandatory: false },
  { eventType: "assertion.expired", label: "Expired assertions", mandatory: false },
  { eventType: "security.alert", label: "Security alerts", mandatory: true },
  { eventType: "ownership.changed", label: "Ownership changes", mandatory: true },
] as const satisfies readonly {
  eventType: NotificationEventType;
  label: string;
  mandatory: boolean;
}[];

const mandatoryEventTypes = notificationEventCatalog
  .filter(({ mandatory }) => mandatory)
  .map(({ eventType }) => eventType);

export async function listNotifications(
  db: Database,
  organizationId: string,
  membershipId: string,
  limit = 50,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const now = new Date();
    const visible = or(
      inArray(notifications.eventType, mandatoryEventTypes),
      and(
        or(
          isNull(notificationPreferences.membershipId),
          eq(notificationPreferences.inAppEnabled, true),
        ),
        or(
          isNull(notificationPreferences.mutedUntil),
          lte(notificationPreferences.mutedUntil, now),
        ),
      ),
    );
    const [rows, unread] = await Promise.all([
      tx
        .select({
          id: notifications.id,
          eventType: notifications.eventType,
          severity: notifications.severity,
          title: notifications.title,
          bodyText: notifications.bodyText,
          deepLinkPath: notifications.deepLinkPath,
          readAt: notifications.readAt,
          dismissedAt: notifications.dismissedAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .leftJoin(
          notificationPreferences,
          and(
            eq(notificationPreferences.organizationId, notifications.organizationId),
            eq(notificationPreferences.membershipId, membershipId),
            eq(notificationPreferences.eventType, notifications.eventType),
          ),
        )
        .where(
          and(
            eq(notifications.organizationId, organizationId),
            eq(notifications.targetMembershipId, membershipId),
            isNull(notifications.dismissedAt),
            visible,
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(boundedLimit),
      tx
        .select({ value: count() })
        .from(notifications)
        .leftJoin(
          notificationPreferences,
          and(
            eq(notificationPreferences.organizationId, notifications.organizationId),
            eq(notificationPreferences.membershipId, membershipId),
            eq(notificationPreferences.eventType, notifications.eventType),
          ),
        )
        .where(
          and(
            eq(notifications.organizationId, organizationId),
            eq(notifications.targetMembershipId, membershipId),
            isNull(notifications.readAt),
            isNull(notifications.dismissedAt),
            visible,
          ),
        ),
    ]);
    return { data: rows, unreadCount: Number(unread[0]?.value ?? 0) };
  });
}

export async function listNotificationPreferences(
  db: Database,
  organizationId: string,
  membershipId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const rows = await tx
      .select({
        eventType: notificationPreferences.eventType,
        inAppEnabled: notificationPreferences.inAppEnabled,
        digestEnabled: notificationPreferences.digestEnabled,
        mutedUntil: notificationPreferences.mutedUntil,
        updatedAt: notificationPreferences.updatedAt,
      })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.organizationId, organizationId),
          eq(notificationPreferences.membershipId, membershipId),
        ),
      );
    const saved = new Map(rows.map((row) => [row.eventType, row]));
    return notificationEventCatalog.map((event) => {
      const preference = saved.get(event.eventType);
      return {
        ...event,
        inAppEnabled: event.mandatory ? true : (preference?.inAppEnabled ?? true),
        digestEnabled: event.mandatory ? true : (preference?.digestEnabled ?? true),
        mutedUntil: event.mandatory ? null : (preference?.mutedUntil ?? null),
        updatedAt: preference?.updatedAt ?? null,
      };
    });
  });
}

export async function updateNotificationPreference(
  db: Database,
  organizationId: string,
  membershipId: string,
  eventType: NotificationEventType,
  input: { inAppEnabled: boolean; digestEnabled: boolean; mutedUntil: Date | null },
  actor: { userId: string; requestId: string },
) {
  const catalogEntry = notificationEventCatalog.find((entry) => entry.eventType === eventType);
  if (!catalogEntry) return null;
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const effective = catalogEntry.mandatory
      ? { inAppEnabled: true, digestEnabled: true, mutedUntil: null }
      : input;
    await tx
      .insert(notificationPreferences)
      .values({ organizationId, membershipId, eventType, ...effective, updatedAt: now })
      .onConflictDoUpdate({
        target: [notificationPreferences.membershipId, notificationPreferences.eventType],
        set: { ...effective, updatedAt: now },
      });
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: now,
      actorType: "user",
      actorId: actor.userId,
      action: "notification.preference_updated",
      resourceType: "notification_preference",
      resourceId: `${membershipId}:${eventType}`,
      requestId: actor.requestId,
      changes: { eventType, ...effective, mandatory: catalogEntry.mandatory },
      outcome: "succeeded",
    });
    return { ...catalogEntry, ...effective, updatedAt: now };
  });
}

export async function markNotificationRead(
  db: Database,
  organizationId: string,
  membershipId: string,
  notificationId: string,
  actor: { userId: string; requestId: string },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const [record] = await tx
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.id, notificationId),
          eq(notifications.targetMembershipId, membershipId),
          isNull(notifications.dismissedAt),
        ),
      )
      .returning({ id: notifications.id });
    if (!record) return false;
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: now,
      actorType: "user",
      actorId: actor.userId,
      action: "notification.read",
      resourceType: "notification",
      resourceId: notificationId,
      requestId: actor.requestId,
      changes: {},
      outcome: "succeeded",
    });
    return true;
  });
}

export async function dismissNotification(
  db: Database,
  organizationId: string,
  membershipId: string,
  notificationId: string,
  actor: { userId: string; requestId: string },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const [record] = await tx
      .update(notifications)
      .set({ readAt: now, dismissedAt: now })
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.id, notificationId),
          eq(notifications.targetMembershipId, membershipId),
        ),
      )
      .returning({ id: notifications.id });
    if (!record) return false;
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: now,
      actorType: "user",
      actorId: actor.userId,
      action: "notification.dismissed",
      resourceType: "notification",
      resourceId: notificationId,
      requestId: actor.requestId,
      changes: {},
      outcome: "succeeded",
    });
    return true;
  });
}
