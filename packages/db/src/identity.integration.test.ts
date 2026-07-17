import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listHumanOrganizations, syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";

const databaseUrl = process.env.DATABASE_TEST_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("identity organization selection", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    if (!databaseUrl) throw new Error("DATABASE_TEST_URL is required");
    client = createDatabaseClient(databaseUrl, 1);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("returns only active organizations for the exact WorkOS subject", async () => {
    const suffix = crypto.randomUUID();
    const subject = `user_${suffix}`;
    const active = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_active_${suffix}`,
      organizationName: "Active workspace",
      organizationSlug: `active-${suffix}`,
      workosUserId: subject,
      userEmail: `${suffix}@example.test`,
      userDisplayName: "Identity tester",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_active_${suffix}`,
      role: "owner",
      status: "active",
    });
    await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_revoked_${suffix}`,
      organizationName: "Revoked workspace",
      organizationSlug: `revoked-${suffix}`,
      workosUserId: subject,
      userEmail: `${suffix}@example.test`,
      userDisplayName: "Identity tester",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_revoked_${suffix}`,
      role: "viewer",
      status: "revoked",
    });

    const choices = await listHumanOrganizations(client.sql, subject);
    expect(choices).toEqual([
      expect.objectContaining({
        organizationId: active.organizationId,
        workosOrganizationId: `org_active_${suffix}`,
        name: "Active workspace",
        role: "owner",
        status: "provisioning",
      }),
    ]);
    await expect(listHumanOrganizations(client.sql, `other_${suffix}`)).resolves.toEqual([]);
  });

  it("never promotes the first mirrored provider member", async () => {
    const suffix = crypto.randomUUID();
    const membership = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_viewer_${suffix}`,
      organizationName: "Viewer-first workspace",
      organizationSlug: `viewer-first-${suffix}`,
      workosUserId: `user_viewer_${suffix}`,
      userEmail: `viewer-${suffix}@example.test`,
      userDisplayName: "Viewer",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_viewer_${suffix}`,
      role: "viewer",
      status: "active",
    });

    expect(membership.role).toBe("viewer");
  });
});
