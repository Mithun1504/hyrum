import { z } from "zod";

export const notificationEventTypeSchema = z.enum([
  "gate.block",
  "gate.warn",
  "assertion.expiring",
  "assertion.expired",
  "security.alert",
  "ownership.changed",
]);

export const notificationPreferenceSchema = z.object({
  eventType: notificationEventTypeSchema,
  label: z.string(),
  mandatory: z.boolean(),
  inAppEnabled: z.boolean(),
  digestEnabled: z.boolean(),
  mutedUntil: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export const notificationPreferenceListSchema = z.object({
  data: z.array(notificationPreferenceSchema),
});
export const updateNotificationPreferenceSchema = z.strictObject({
  inAppEnabled: z.boolean(),
  digestEnabled: z.boolean(),
  mutedUntil: z.iso.datetime().nullable(),
});
export const notificationPreferencePathParamsSchema = z.strictObject({
  eventType: notificationEventTypeSchema,
});

export const notificationSchema = z.object({
  id: z.uuid(),
  eventType: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  bodyText: z.string(),
  deepLinkPath: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  dismissedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const notificationInboxSchema = z.object({
  data: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
});
export const notificationPathParamsSchema = z.strictObject({ notificationId: z.uuid() });
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;
export type UpdateNotificationPreference = z.infer<typeof updateNotificationPreferenceSchema>;
