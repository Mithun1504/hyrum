import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { auditEvents, outboxEvents } from "./schema";
import { createApiService, getApiService, listApiServices } from "./services";
import { withOrganizationContext } from "./tenancy";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("service repository integration", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 1);
  });

  afterAll(async () => {
    await client.close();
  });

  it("creates the service boundary atomically with audit and outbox records", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_service_test_${suffix}`,
      organizationName: "Service Test",
      organizationSlug: `service-test-${suffix}`,
      workosUserId: `user_service_test_${suffix}`,
      userEmail: `lead-${suffix}@example.test`,
      userDisplayName: "Platform Lead",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_service_test_${suffix}`,
      role: "admin",
      status: "active",
    });

    const created = await createApiService(
      client.db,
      identity.organizationId,
      {
        userId: identity.userId,
        membershipId: identity.membershipId,
        requestId: `request-${suffix}`,
      },
      {
        name: "Payments API",
        slug: "payments-api",
        description: "Public payment operations",
        environment: {
          name: "Production",
          slug: "production",
          kind: "production",
          baseUrlOrigin: "https://api.example.test",
        },
      },
    );

    expect(created.defaultEnvironment).toMatchObject({ isDefault: true, captureEnabled: false });
    const listed = await listApiServices(client.db, identity.organizationId, 25);
    expect(listed.records.map((service) => service.id)).toContain(created.id);
    await expect(getApiService(client.db, identity.organizationId, created.slug)).resolves.toEqual(
      created,
    );
    await expect(getApiService(client.db, identity.organizationId, created.id)).resolves.toEqual(
      created,
    );

    const otherIdentity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_other_service_test_${suffix}`,
      organizationName: "Other Service Test",
      organizationSlug: `other-service-test-${suffix}`,
      workosUserId: `user_other_service_test_${suffix}`,
      userEmail: `other-${suffix}@example.test`,
      userDisplayName: "Other Platform Lead",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_other_service_test_${suffix}`,
      role: "admin",
      status: "active",
    });
    await expect(
      getApiService(client.db, otherIdentity.organizationId, created.slug),
    ).resolves.toBeNull();
    await expect(
      getApiService(client.db, otherIdentity.organizationId, created.id),
    ).resolves.toBeNull();

    const counts = await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      const [audit] = await tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(eq(auditEvents.resourceId, created.id));
      const [event] = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(eq(outboxEvents.aggregateId, created.id));
      return { audit: Boolean(audit), outbox: Boolean(event) };
    });
    expect(counts).toEqual({ audit: true, outbox: true });
  });
});
