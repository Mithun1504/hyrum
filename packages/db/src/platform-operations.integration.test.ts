import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import {
  approveSupportGrant,
  createSupportGrant,
  resolveActiveSupportAccess,
} from "./platform-operations";
import { organizations, platformOperators } from "./schema";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("platform support operations integration", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 1);
  });

  afterAll(async () => {
    await client.close();
  });

  it("requires a distinct second operator before granting bounded read-only access", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const requesterIdentity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_support_${suffix}`,
      organizationName: "Support Target",
      organizationSlug: `support-target-${suffix}`,
      workosUserId: `operator_requester_${suffix}`,
      userEmail: `requester-${suffix}@example.test`,
      userDisplayName: "Support Requester",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_requester_${suffix}`,
      role: "owner",
      status: "active",
    });
    const approverIdentity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_support_${suffix}`,
      organizationName: "Support Target",
      organizationSlug: `support-target-${suffix}`,
      workosUserId: `operator_approver_${suffix}`,
      userEmail: `approver-${suffix}@example.test`,
      userDisplayName: "Support Approver",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_approver_${suffix}`,
      role: "viewer",
      status: "active",
    });
    const [requester] = await client.db
      .insert(platformOperators)
      .values({
        userId: requesterIdentity.userId,
        capabilities: ["support_grant:request"],
      })
      .returning();
    await client.db
      .update(organizations)
      .set({ status: "active" })
      .where(eq(organizations.id, requesterIdentity.organizationId));
    const [approver] = await client.db
      .insert(platformOperators)
      .values({
        userId: approverIdentity.userId,
        capabilities: ["support_grant:approve"],
      })
      .returning();
    if (!requester || !approver) throw new Error("Operator fixture failed");
    const grant = await createSupportGrant(
      client.db,
      { id: requester.id, userId: requester.userId, capabilities: requester.capabilities },
      `request-${suffix}`,
      {
        organizationId: requesterIdentity.organizationId,
        reason: "Investigate an evidence freshness incident reported by the customer.",
        ticketReference: `SUP-${suffix}`,
        scopes: ["ledger:read", "report:read"],
        durationMinutes: 15,
      },
    );
    if (!grant) throw new Error("Support grant fixture failed");
    await expect(
      approveSupportGrant(
        client.db,
        { id: requester.id, userId: requester.userId, capabilities: requester.capabilities },
        `self-${suffix}`,
        grant.id,
      ),
    ).resolves.toBeNull();
    await expect(
      resolveActiveSupportAccess(client.db, `operator_requester_${suffix}`, grant.id),
    ).resolves.toBeNull();
    await expect(
      approveSupportGrant(
        client.db,
        { id: approver.id, userId: approver.userId, capabilities: approver.capabilities },
        `approve-${suffix}`,
        grant.id,
      ),
    ).resolves.toMatchObject({ approvedByOperatorId: approver.id });
    await expect(
      resolveActiveSupportAccess(client.db, `operator_requester_${suffix}`, grant.id),
    ).resolves.toMatchObject({
      organizationId: requesterIdentity.organizationId,
      scopes: ["ledger:read", "report:read"],
    });
    await expect(
      client.db.select().from(platformOperators).where(eq(platformOperators.id, requester.id)),
    ).resolves.toHaveLength(1);
  });
});
