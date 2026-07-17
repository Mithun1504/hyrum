import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  auditEvents,
  dataSubjectRequests,
  jobs,
  memberships,
  organizationSettings,
  organizations,
  platformAuditEvents,
  storedObjects,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";
import { withOrganizationContext } from "./tenancy";

export async function listDataSubjectRequests(db: Database, organizationId: string) {
  return withOrganizationContext(db, organizationId, (tx) =>
    tx
      .select({
        id: dataSubjectRequests.id,
        requestType: dataSubjectRequests.requestType,
        status: dataSubjectRequests.status,
        requestedAt: dataSubjectRequests.requestedAt,
        completedAt: dataSubjectRequests.completedAt,
        failureCode: dataSubjectRequests.failureCode,
        exportAvailable: sql<boolean>`${dataSubjectRequests.exportObjectId} is not null`,
      })
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.organizationId, organizationId))
      .orderBy(desc(dataSubjectRequests.requestedAt))
      .limit(100),
  );
}

export async function createDataSubjectRequest(
  db: Database,
  organizationId: string,
  actor: { membershipId: string; userId: string; requestId: string },
  input: { requestType: "export" | "delete_organization"; confirmation: string },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [organization] = await tx
      .select({
        name: organizations.name,
        dataExportEnabled: organizationSettings.dataExportEnabled,
      })
      .from(organizations)
      .innerJoin(organizationSettings, eq(organizationSettings.organizationId, organizations.id))
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!organization) throw new Error("Organization not found");
    if (input.requestType === "export" && !organization.dataExportEnabled) {
      throw new Error("Organization exports are disabled in workspace settings");
    }
    const expected =
      input.requestType === "delete_organization" ? `DELETE ${organization.name}` : "EXPORT";
    if (input.confirmation !== expected) throw new Error(`Confirmation must equal ${expected}`);
    const [existing] = await tx
      .select({ id: dataSubjectRequests.id, status: dataSubjectRequests.status })
      .from(dataSubjectRequests)
      .where(
        and(
          eq(dataSubjectRequests.organizationId, organizationId),
          eq(dataSubjectRequests.requestType, input.requestType),
          sql`${dataSubjectRequests.status} in ('pending', 'verified', 'processing')`,
        ),
      )
      .limit(1);
    if (existing) return existing;
    const now = new Date();
    const [request] = await tx
      .insert(dataSubjectRequests)
      .values({
        organizationId,
        requestType: input.requestType,
        requestedByMembershipId: actor.membershipId,
        status: "verified",
        verificationCompletedAt: now,
      })
      .returning({ id: dataSubjectRequests.id, status: dataSubjectRequests.status });
    if (!request) throw new Error("Privacy request could not be created");
    await Promise.all([
      tx.insert(jobs).values({
        organizationId,
        type:
          input.requestType === "export"
            ? "export_organization_data"
            : "prepare_organization_deletion",
        payload: { dataSubjectRequestId: request.id },
        idempotencyKey: `privacy:${request.id}`,
        concurrencyKey: `privacy:${organizationId}`,
        maxAttempts: 5,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: `privacy.${input.requestType}_requested`,
        resourceType: "data_subject_request",
        resourceId: request.id,
        requestId: actor.requestId,
        changes: { requestType: input.requestType },
        outcome: "succeeded",
      }),
    ]);
    return request;
  });
}

export async function prepareOrganizationExport(
  tx: DatabaseTransaction,
  organizationId: string,
  requestId: string,
) {
  const [request] = await tx
    .update(dataSubjectRequests)
    .set({ status: "processing", failureCode: null })
    .where(
      and(
        eq(dataSubjectRequests.organizationId, organizationId),
        eq(dataSubjectRequests.id, requestId),
        eq(dataSubjectRequests.requestType, "export"),
        sql`${dataSubjectRequests.status} in ('verified', 'processing')`,
      ),
    )
    .returning({ id: dataSubjectRequests.id });
  if (!request) return null;
  const [organization] = await tx
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      region: organizations.region,
      retentionDays: organizations.retentionDays,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const membershipRows = await tx
    .select({
      role: memberships.role,
      status: memberships.status,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .where(eq(memberships.organizationId, organizationId));
  const counts = await tx.execute<Record<string, unknown>>(sql`
    select
      (select count(*)::int from api_services where organization_id = ${organizationId}) service_count,
      (select count(*)::int from consumers where organization_id = ${organizationId}) consumer_count,
      (select count(*)::int from dependency_claims where organization_id = ${organizationId}) claim_count,
      (select count(*)::int from assertions where organization_id = ${organizationId}) assertion_count,
      (select count(*)::int from replay_runs where organization_id = ${organizationId}) replay_count
  `);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    organization,
    memberships: membershipRows,
    aggregateCounts: counts[0] ?? {},
    note: "Traffic bodies, credentials, secrets, HMAC inputs, and signed URLs are excluded by design.",
  };
}

export async function completeOrganizationExport(
  tx: DatabaseTransaction,
  organizationId: string,
  requestId: string,
  object: {
    bucket: string;
    objectKey: string;
    byteSize: number;
    sha256Digest: string;
    contentType: string;
    contentEncoding: string | null;
  },
) {
  const [stored] = await tx
    .insert(storedObjects)
    .values({
      organizationId,
      kind: "generated_artifact",
      ...object,
      byteSize: BigInt(object.byteSize),
      scanStatus: "not_required",
      scannedAt: new Date(),
      availabilityStatus: "available",
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      createdByActorType: "system",
      createdByActorId: "worker:export_organization_data",
    })
    .returning({ id: storedObjects.id });
  if (!stored) throw new Error("Export metadata could not be persisted");
  await tx
    .update(dataSubjectRequests)
    .set({ status: "completed", exportObjectId: stored.id, completedAt: new Date() })
    .where(
      and(
        eq(dataSubjectRequests.organizationId, organizationId),
        eq(dataSubjectRequests.id, requestId),
      ),
    );
}

export async function getOrganizationExportObject(
  db: Database,
  organizationId: string,
  requestId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({ objectKey: storedObjects.objectKey })
      .from(dataSubjectRequests)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.organizationId, dataSubjectRequests.organizationId),
          eq(storedObjects.id, dataSubjectRequests.exportObjectId),
          eq(storedObjects.availabilityStatus, "available"),
        ),
      )
      .where(
        and(
          eq(dataSubjectRequests.organizationId, organizationId),
          eq(dataSubjectRequests.id, requestId),
          eq(dataSubjectRequests.status, "completed"),
        ),
      );
    return row ?? null;
  });
}

export async function prepareOrganizationDeletion(
  tx: DatabaseTransaction,
  organizationId: string,
  requestId: string,
) {
  const [request] = await tx
    .select({ id: dataSubjectRequests.id })
    .from(dataSubjectRequests)
    .where(
      and(
        eq(dataSubjectRequests.organizationId, organizationId),
        eq(dataSubjectRequests.id, requestId),
        eq(dataSubjectRequests.requestType, "delete_organization"),
        sql`${dataSubjectRequests.status} in ('verified', 'processing')`,
      ),
    );
  if (!request) return null;
  const objects = await tx
    .select({ id: storedObjects.id, kind: storedObjects.kind, digest: storedObjects.sha256Digest })
    .from(storedObjects)
    .where(eq(storedObjects.organizationId, organizationId))
    .orderBy(asc(storedObjects.id));
  return {
    schemaVersion: 1,
    organizationId,
    requestId,
    preparedAt: new Date().toISOString(),
    objects,
  };
}

export async function markOrganizationDeletionPrepared(
  tx: DatabaseTransaction,
  organizationId: string,
  requestId: string,
  manifest: {
    bucket: string;
    objectKey: string;
    byteSize: number;
    sha256Digest: string;
    contentType: string;
    contentEncoding: string | null;
  },
) {
  const [stored] = await tx
    .insert(storedObjects)
    .values({
      organizationId,
      kind: "deletion_manifest",
      ...manifest,
      byteSize: BigInt(manifest.byteSize),
      scanStatus: "not_required",
      scannedAt: new Date(),
      availabilityStatus: "available",
      verifiedAt: new Date(),
      createdByActorType: "system",
      createdByActorId: "worker:prepare_organization_deletion",
    })
    .returning({ id: storedObjects.id });
  if (!stored) throw new Error("Deletion manifest metadata could not be persisted");
  await tx
    .update(dataSubjectRequests)
    .set({ status: "processing", deletionManifestObjectId: stored.id })
    .where(
      and(
        eq(dataSubjectRequests.organizationId, organizationId),
        eq(dataSubjectRequests.id, requestId),
      ),
    );
  await tx
    .update(organizations)
    .set({ status: "deleting" })
    .where(and(eq(organizations.id, organizationId), eq(organizations.status, "active")));
}

export async function listDeletingOrganizations(db: Database, limit = 10) {
  return db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.status, "deleting"))
    .orderBy(organizations.updatedAt)
    .limit(limit);
}

export async function listOrganizationObjectKeys(db: Database, organizationId: string) {
  return db
    .select({ objectKey: storedObjects.objectKey })
    .from(storedObjects)
    .where(eq(storedObjects.organizationId, organizationId));
}

export async function purgeOrganizationRecords(
  db: Database,
  organizationId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [summary] = await tx.execute<Record<string, unknown>>(sql`
      select
        (select count(*)::int from stored_objects where organization_id = ${organizationId}) object_count,
        (select count(*)::int from memberships where organization_id = ${organizationId}) membership_count,
        (select count(*)::int from dependency_claims where organization_id = ${organizationId}) claim_count
    `);
    const changeDigest = createHash("sha256")
      .update(JSON.stringify({ organizationId, summary: summary ?? {} }))
      .digest("hex");
    await tx.insert(platformAuditEvents).values({
      occurredAt: new Date(),
      actorType: "system",
      actorId: "worker:purge_deleting_organizations",
      action: "privacy.organization_deleted",
      resourceType: "organization",
      resourceId: organizationId,
      requestId: `purge:${organizationId}`,
      changeDigest,
      metadata: { recordCounts: summary ?? {} },
      outcome: "succeeded",
    });
    await tx.delete(organizations).where(eq(organizations.id, organizationId));
  });
}
