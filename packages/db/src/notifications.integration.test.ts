import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import {
  listNotificationPreferences,
  listNotifications,
  updateNotificationPreference,
} from "./notifications";
import { notifications } from "./schema";
import { withOrganizationContext } from "./tenancy";

const databaseUrl = process.env.DATABASE_TEST_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("notification preferences", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    if (!databaseUrl) throw new Error("DATABASE_TEST_URL is required");
    client = createDatabaseClient(databaseUrl, 1);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("hides muted optional events but never suppresses mandatory events", async () => {
    const suffix = crypto.randomUUID();
    const owner = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_notifications_${suffix}`,
      organizationName: "Notification workspace",
      organizationSlug: `notifications-${suffix}`,
      workosUserId: `user_notifications_${suffix}`,
      userEmail: `notifications-${suffix}@example.test`,
      userDisplayName: "Notification owner",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_notifications_${suffix}`,
      role: "owner",
      status: "active",
    });
    const actor = { userId: owner.userId, requestId: `request-${suffix}` };
    await withOrganizationContext(client.db, owner.organizationId, async (tx) => {
      await tx.insert(notifications).values([
        {
          organizationId: owner.organizationId,
          targetMembershipId: owner.membershipId,
          eventType: "gate.warn",
          severity: "warning",
          title: "Optional warning",
          bodyText: "A deterministic replay warning needs review.",
          deduplicationKey: `optional-${suffix}`,
        },
        {
          organizationId: owner.organizationId,
          targetMembershipId: owner.membershipId,
          eventType: "security.alert",
          severity: "critical",
          title: "Mandatory security alert",
          bodyText: "A security setting changed.",
          deduplicationKey: `mandatory-${suffix}`,
        },
      ]);
    });

    await updateNotificationPreference(
      client.db,
      owner.organizationId,
      owner.membershipId,
      "gate.warn",
      { inAppEnabled: false, digestEnabled: false, mutedUntil: null },
      actor,
    );
    const mandatory = await updateNotificationPreference(
      client.db,
      owner.organizationId,
      owner.membershipId,
      "security.alert",
      { inAppEnabled: false, digestEnabled: false, mutedUntil: new Date(Date.now() + 86_400_000) },
      actor,
    );

    expect(mandatory).toMatchObject({
      mandatory: true,
      inAppEnabled: true,
      digestEnabled: true,
      mutedUntil: null,
    });
    const inbox = await listNotifications(client.db, owner.organizationId, owner.membershipId);
    expect(inbox.data.map(({ eventType }) => eventType)).toEqual(["security.alert"]);
    expect(inbox.unreadCount).toBe(1);
    const preferences = await listNotificationPreferences(
      client.db,
      owner.organizationId,
      owner.membershipId,
    );
    expect(preferences.find(({ eventType }) => eventType === "gate.warn")).toMatchObject({
      inAppEnabled: false,
    });
  });
});
