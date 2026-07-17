import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { getServiceInsights, listConsumerInsights, listEndpointInsights } from "./insights";
import { getServiceHealthReport } from "./reporting";
import { searchOrganization } from "./search";
import { createApiService } from "./services";

const databaseUrl = process.env.DATABASE_TEST_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("tenant reporting and search", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    if (!databaseUrl) throw new Error("DATABASE_TEST_URL is required");
    client = createDatabaseClient(databaseUrl, 1);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("returns explicit empty samples without leaking another tenant", async () => {
    const suffix = crypto.randomUUID();
    const owner = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_reporting_${suffix}`,
      organizationName: "Reporting workspace",
      organizationSlug: `reporting-${suffix}`,
      workosUserId: `user_reporting_${suffix}`,
      userEmail: `reporting-${suffix}@example.test`,
      userDisplayName: "Reporting owner",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_reporting_${suffix}`,
      role: "owner",
      status: "active",
    });
    const service = await createApiService(
      client.db,
      owner.organizationId,
      {
        userId: owner.userId,
        membershipId: owner.membershipId,
        requestId: `request-${suffix}`,
      },
      {
        name: "Reporting API",
        slug: `reporting-api-${suffix}`,
        description: null,
        environment: {
          name: "Production",
          slug: "production",
          kind: "production",
          baseUrlOrigin: "https://reporting.example.test",
        },
      },
    );

    await expect(
      getServiceHealthReport(client.db, owner.organizationId, service.id),
    ).resolves.toMatchObject({
      ledger: { total: 0, byTier: {}, byFreshness: {} },
      assertions: { total: 0, byStatus: {} },
      gates: { total: 0, byOutcome: {} },
      consumers: 0,
      operations: 0,
      timeToFirstUsefulLedgerSeconds: null,
      usage: { ingestedSessions: "0", replayRequests: "0", jobFailures: 0 },
    });
    await expect(searchOrganization(client.db, owner.organizationId, "secret", 5)).resolves.toEqual(
      { query: "secret", groups: { endpoints: [], consumers: [], ledger: [] } },
    );
    await expect(
      getServiceInsights(client.db, owner.organizationId, service.id),
    ).resolves.toMatchObject({
      ledger: { total: 0 },
      replays: { total: 0, stableDeltaRate: null, stableDeltaSampleCount: 0 },
      quality: { precision: null, recall: null, sampleCount: 0 },
    });
    await expect(
      listConsumerInsights(client.db, owner.organizationId, service.id),
    ).resolves.toEqual([]);
    await expect(
      listEndpointInsights(client.db, owner.organizationId, service.id),
    ).resolves.toEqual([]);
  });
});
