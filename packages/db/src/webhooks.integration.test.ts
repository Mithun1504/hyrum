import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { listMemberDirectory, recordOrganizationInvitation } from "./members";
import { webhookDeliveries } from "./schema";
import { withOrganizationContext } from "./tenancy";
import {
  claimWebhookDelivery,
  finishWebhookDelivery,
  revokeWorkosMembership,
  syncWorkosInvitationState,
} from "./webhooks";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("WorkOS webhook reconciliation", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 4);
  });

  afterAll(async () => {
    await client.close();
  });

  it("deduplicates deliveries, retries failures, and reconciles tenant identity state", async () => {
    const suffix = crypto.randomUUID();
    const workosOrganizationId = `org_webhook_${suffix}`;
    const workosMembershipId = `membership_webhook_${suffix}`;
    const deliveryId = `event_webhook_${suffix}`;
    const payloadDigest = `digest-${suffix}`;

    expect(
      await claimWebhookDelivery(client.sql, {
        provider: "workos",
        deliveryId,
        eventType: "organization_membership.created",
        payloadDigest,
      }),
    ).toBe(true);
    expect(
      await claimWebhookDelivery(client.sql, {
        provider: "workos",
        deliveryId,
        eventType: "organization_membership.created",
        payloadDigest,
      }),
    ).toBe(false);

    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId,
      organizationName: "Webhook workspace",
      organizationSlug: `webhook-${suffix}`,
      workosUserId: `user_webhook_${suffix}`,
      userEmail: `webhook-${suffix}@example.test`,
      userDisplayName: "Webhook user",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(0),
      workosMembershipId,
      role: "admin",
      status: "active",
    });
    await finishWebhookDelivery(client.sql, {
      provider: "workos",
      deliveryId,
      workosOrganizationId,
      status: "processed",
      errorCode: null,
    });

    const [delivery] = await withOrganizationContext(client.db, identity.organizationId, (tx) =>
      tx
        .select({ status: webhookDeliveries.status, attempts: webhookDeliveries.attempts })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.deliveryId, deliveryId)),
    );
    expect(delivery).toEqual({ status: "processed", attempts: 1 });

    const retryId = `event_retry_${suffix}`;
    expect(
      await claimWebhookDelivery(client.sql, {
        provider: "workos",
        deliveryId: retryId,
        eventType: "organization_membership.updated",
        payloadDigest,
      }),
    ).toBe(true);
    await finishWebhookDelivery(client.sql, {
      provider: "workos",
      deliveryId: retryId,
      workosOrganizationId,
      status: "failed",
      errorCode: "TRANSIENT_PROVIDER_ERROR",
    });
    expect(
      await claimWebhookDelivery(client.sql, {
        provider: "workos",
        deliveryId: retryId,
        eventType: "organization_membership.updated",
        payloadDigest,
      }),
    ).toBe(true);

    const actor = {
      userId: identity.userId,
      membershipId: identity.membershipId,
      role: "admin" as const,
      requestId: `request-${suffix}`,
    };
    const invitation = await recordOrganizationInvitation(
      client.db,
      identity.organizationId,
      actor,
      {
        email: `invite-${suffix}@example.test`,
        role: "viewer",
        workosInvitationId: `invitation_${suffix}`,
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedAt: null,
        status: "pending",
      },
    );
    await syncWorkosInvitationState(client.sql, {
      workosInvitationId: `invitation_${suffix}`,
      status: "accepted",
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: new Date(),
    });
    expect(
      (await listMemberDirectory(client.db, identity.organizationId)).invitations.find(
        ({ id }) => id === invitation.id,
      )?.status,
    ).toBe("accepted");

    await revokeWorkosMembership(client.sql, workosMembershipId);
    expect(
      (await listMemberDirectory(client.db, identity.organizationId)).members.find(
        ({ id }) => id === identity.membershipId,
      )?.status,
    ).toBe("revoked");
  });
});
