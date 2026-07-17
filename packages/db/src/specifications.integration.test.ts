import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { createApiService } from "./services";
import { findApiSpecificationByDigest, persistApiSpecification } from "./specifications";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("specification persistence", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 4);
  });

  afterAll(async () => {
    await client.close();
  });

  it("activates an immutable spec, maps operations, and deduplicates re-uploads", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_spec_test_${suffix}`,
      organizationName: "Spec Test",
      organizationSlug: `spec-test-${suffix}`,
      workosUserId: `user_spec_test_${suffix}`,
      userEmail: `spec-${suffix}@example.test`,
      userDisplayName: "Spec Test",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_spec_test_${suffix}`,
      role: "engineer",
      status: "active",
    });
    const actor = {
      userId: identity.userId,
      membershipId: identity.membershipId,
      requestId: `request-${suffix}`,
    };
    const service = await createApiService(client.db, identity.organizationId, actor, {
      name: "Payments",
      slug: `payments-${suffix}`,
      environment: { name: "Production", slug: "production", kind: "production" },
    });
    const object = (digest: string, label: string) => ({
      bucket: "test",
      objectKey: `${identity.organizationId}/api-spec/${label}-${suffix}`,
      byteSize: 100,
      sha256Digest: digest,
      contentType: "application/json",
      contentEncoding: null,
    });
    const input = {
      versionLabel: "v1",
      originalDigest: `original-${suffix}`,
      normalizedDigest: `normalized-${suffix}`,
      openapiVersion: "3.1.0",
      operations: [
        {
          httpMethod: "GET",
          normalizedPathTemplate: "/payments/{}",
          operationKey: `operation-${suffix}`,
          operationId: "getPayment",
          summary: "Get a payment",
          normalizedContract: { responses: { "200": { description: "ok" } } },
          contractDigest: `contract-${suffix}`,
        },
      ],
    };
    const first = await persistApiSpecification(
      client.db,
      identity.organizationId,
      service.id,
      actor,
      input,
      object(input.originalDigest, "original"),
      object(input.normalizedDigest, "normalized"),
    );
    expect(first.created).toBe(true);
    expect(first.specification.operations).toHaveLength(1);
    expect(first.specification.isCurrent).toBe(true);

    const duplicate = await persistApiSpecification(
      client.db,
      identity.organizationId,
      service.id,
      actor,
      input,
      object(input.originalDigest, "duplicate-original"),
      object(input.normalizedDigest, "duplicate-normalized"),
    );
    expect(duplicate.created).toBe(false);
    expect(duplicate.specification.id).toBe(first.specification.id);
    expect(
      await findApiSpecificationByDigest(
        client.db,
        identity.organizationId,
        service.id,
        input.normalizedDigest,
      ),
    ).toMatchObject({ id: first.specification.id, validationStatus: "valid" });
  });
});
