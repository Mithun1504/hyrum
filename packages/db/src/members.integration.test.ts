import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import {
  listMemberDirectory,
  recordOrganizationInvitation,
  transferOrganizationOwnership,
  updateOrganizationMember,
} from "./members";

const databaseUrl = process.env.DATABASE_TEST_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("organization membership repository", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    if (!databaseUrl) throw new Error("DATABASE_TEST_URL is required");
    client = createDatabaseClient(databaseUrl, 1);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("audits invitations and preserves an explicit ownership transfer", async () => {
    const suffix = crypto.randomUUID();
    const owner = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_members_${suffix}`,
      organizationName: "Membership workspace",
      organizationSlug: `members-${suffix}`,
      workosUserId: `user_owner_${suffix}`,
      userEmail: `owner-${suffix}@example.test`,
      userDisplayName: "Owner",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_owner_${suffix}`,
      role: "owner",
      status: "active",
    });
    const engineer = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_members_${suffix}`,
      organizationName: "Membership workspace",
      organizationSlug: `members-${suffix}`,
      workosUserId: `user_engineer_${suffix}`,
      userEmail: `engineer-${suffix}@example.test`,
      userDisplayName: "Engineer",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_engineer_${suffix}`,
      role: "engineer",
      status: "active",
    });
    const actor = {
      userId: owner.userId,
      membershipId: owner.membershipId,
      role: "owner" as const,
      requestId: `request-${suffix}`,
    };

    await recordOrganizationInvitation(client.db, owner.organizationId, actor, {
      email: `viewer-${suffix}@example.test`,
      role: "viewer",
      workosInvitationId: `invitation_${suffix}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: null,
      status: "pending",
    });
    await updateOrganizationMember(client.db, owner.organizationId, actor, engineer.membershipId, {
      role: "admin",
    });

    await transferOrganizationOwnership(
      client.db,
      owner.organizationId,
      actor,
      engineer.membershipId,
    );
    const directory = await listMemberDirectory(client.db, owner.organizationId);
    expect(directory.invitations).toHaveLength(1);
    expect(directory.members.find((member) => member.id === owner.membershipId)?.role).toBe(
      "admin",
    );
    expect(directory.members.find((member) => member.id === engineer.membershipId)?.role).toBe(
      "owner",
    );
  });

  it("rejects ordinary owner mutation", async () => {
    const suffix = crypto.randomUUID();
    const owner = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_guard_${suffix}`,
      organizationName: "Guard workspace",
      organizationSlug: `guard-${suffix}`,
      workosUserId: `user_guard_${suffix}`,
      userEmail: `guard-${suffix}@example.test`,
      userDisplayName: "Guard",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_guard_${suffix}`,
      role: "owner",
      status: "active",
    });
    const actor = {
      userId: owner.userId,
      membershipId: owner.membershipId,
      role: "owner" as const,
      requestId: `request-${suffix}`,
    };

    await expect(
      updateOrganizationMember(client.db, owner.organizationId, actor, owner.membershipId, {
        role: "viewer",
      }),
    ).rejects.toThrow("OWNER_MEMBER_REQUIRES_TRANSFER");
  });
});
