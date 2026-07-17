import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOrganizationSummary, syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { getServiceOnboardingProgress, updateOrganizationSettings } from "./organization-settings";
import { createApiService } from "./services";

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("organization settings and onboarding", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    if (!databaseUrl) throw new Error("INTEGRATION_DATABASE_URL is required");
    client = createDatabaseClient(databaseUrl, 1);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("persists audited defaults and returns resumable service progress", async () => {
    const suffix = crypto.randomUUID();
    const owner = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_settings_${suffix}`,
      organizationName: "Settings workspace",
      organizationSlug: `settings-${suffix}`,
      workosUserId: `user_settings_${suffix}`,
      userEmail: `settings-${suffix}@example.test`,
      userDisplayName: "Settings owner",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_settings_${suffix}`,
      role: "owner",
      status: "active",
    });
    const actor = {
      userId: owner.userId,
      membershipId: owner.membershipId,
      requestId: `request-${suffix}`,
    };
    await updateOrganizationSettings(client.db, owner.organizationId, actor, {
      name: "Updated workspace",
      timezone: "Asia/Kolkata",
      staleAfterDays: 120,
      defaultAssertionDays: 45,
      defaultReceiptTtlDays: 20,
      notificationDigestEnabled: false,
      dataExportEnabled: true,
    });
    const service = await createApiService(client.db, owner.organizationId, actor, {
      name: "Settings API",
      slug: `settings-api-${suffix}`,
      description: null,
      environment: {
        name: "Production",
        slug: "production",
        kind: "production",
        baseUrlOrigin: "https://api.example.test",
      },
    });

    await expect(getOrganizationSummary(client.db, owner.organizationId)).resolves.toMatchObject({
      name: "Updated workspace",
      timezone: "Asia/Kolkata",
      staleAfterDays: 120,
      defaultAssertionDays: 45,
      defaultReceiptTtlDays: 20,
      notificationDigestEnabled: false,
      dataExportEnabled: true,
    });
    await expect(
      getServiceOnboardingProgress(client.db, owner.organizationId, service.id),
    ).resolves.toMatchObject({
      apiServiceId: service.id,
      currentStep: "specification",
      completedSteps: ["service_and_environment"],
    });
  });
});
