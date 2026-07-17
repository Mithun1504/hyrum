import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import {
  completeOrganizationExport,
  createDataSubjectRequest,
  listDataSubjectRequests,
  markOrganizationDeletionPrepared,
  prepareOrganizationDeletion,
  prepareOrganizationExport,
  purgeOrganizationRecords,
} from "./privacy";
import { jobs, organizations, platformAuditEvents } from "./schema";
import { withOrganizationContext } from "./tenancy";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("privacy lifecycle integration", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 1);
  });

  afterAll(async () => {
    await client.close();
  });

  it("exports allowlisted data and performs two-phase organization deletion", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_privacy_${suffix}`,
      organizationName: "Privacy Test",
      organizationSlug: `privacy-test-${suffix}`,
      workosUserId: `user_privacy_${suffix}`,
      userEmail: `privacy-${suffix}@example.test`,
      userDisplayName: "Privacy Owner",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_privacy_${suffix}`,
      role: "owner",
      status: "active",
    });
    const actor = {
      membershipId: identity.membershipId,
      userId: identity.userId,
      requestId: `privacy-${suffix}`,
    };
    await expect(
      createDataSubjectRequest(client.db, identity.organizationId, actor, {
        requestType: "export",
        confirmation: "wrong",
      }),
    ).rejects.toThrow("Confirmation must equal EXPORT");
    const exportRequest = await createDataSubjectRequest(
      client.db,
      identity.organizationId,
      actor,
      { requestType: "export", confirmation: "EXPORT" },
    );
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      const data = await prepareOrganizationExport(tx, identity.organizationId, exportRequest.id);
      expect(data).toMatchObject({ organization: { name: "Privacy Test" } });
      await completeOrganizationExport(tx, identity.organizationId, exportRequest.id, {
        bucket: "fixture",
        objectKey: `${identity.organizationId}/generated-artifact/${suffix}`,
        byteSize: 100,
        sha256Digest: "a".repeat(64),
        contentType: "application/json",
        contentEncoding: null,
      });
    });
    await expect(listDataSubjectRequests(client.db, identity.organizationId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: exportRequest.id,
          status: "completed",
          exportAvailable: true,
        }),
      ]),
    );

    const deletionRequest = await createDataSubjectRequest(
      client.db,
      identity.organizationId,
      { ...actor, requestId: `delete-${suffix}` },
      { requestType: "delete_organization", confirmation: "DELETE Privacy Test" },
    );
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      const manifest = await prepareOrganizationDeletion(
        tx,
        identity.organizationId,
        deletionRequest.id,
      );
      expect(manifest?.objects).toHaveLength(1);
      await markOrganizationDeletionPrepared(tx, identity.organizationId, deletionRequest.id, {
        bucket: "fixture",
        objectKey: `${identity.organizationId}/deletion-manifest/${suffix}`,
        byteSize: 100,
        sha256Digest: "b".repeat(64),
        contentType: "application/json",
        contentEncoding: null,
      });
      const queued = await tx
        .select({ type: jobs.type })
        .from(jobs)
        .where(
          and(
            eq(jobs.organizationId, identity.organizationId),
            eq(jobs.type, "prepare_organization_deletion"),
          ),
        );
      expect(queued).toHaveLength(1);
    });
    await purgeOrganizationRecords(client.db, identity.organizationId);
    await expect(
      client.db.select().from(organizations).where(eq(organizations.id, identity.organizationId)),
    ).resolves.toHaveLength(0);
    await expect(
      client.db
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.resourceId, identity.organizationId)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "privacy.organization_deleted", outcome: "succeeded" }),
      ]),
    );
  });
});
