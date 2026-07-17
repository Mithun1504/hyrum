import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  apiServices,
  apiSpecOperations,
  apiSpecs,
  auditEvents,
  onboardingProgress,
  outboxEvents,
  storedObjects,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";
import { withOrganizationContext } from "./tenancy";

export interface SpecificationOperationInput {
  httpMethod: string;
  normalizedPathTemplate: string;
  operationKey: string;
  operationId: string | null;
  summary: string | null;
  normalizedContract: Record<string, unknown>;
  contractDigest: string;
}

export interface SpecificationInput {
  versionLabel: string;
  originalDigest: string;
  normalizedDigest: string;
  openapiVersion: string;
  operations: readonly SpecificationOperationInput[];
}

export interface SpecificationActor {
  userId: string;
  membershipId: string;
  requestId: string;
}

export interface StoredObjectDescriptor {
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  contentType: string;
  contentEncoding: string | null;
}

export interface SpecificationRecord {
  id: string;
  apiServiceId: string;
  versionLabel: string;
  source: "upload" | "github" | "generated_draft";
  originalDigest: string;
  normalizedDigest: string;
  openapiVersion: string;
  validationStatus: "pending" | "valid" | "invalid" | "failed";
  validationErrors: string[];
  isCurrent: boolean;
  supersedesSpecId: string | null;
  createdAt: Date;
  operations: Array<{
    id: string;
    httpMethod: string;
    normalizedPathTemplate: string;
    operationKey: string;
    operationId: string | null;
    summary: string | null;
    contractDigest: string;
  }>;
}

function payloadDigest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function readSpecification(
  tx: DatabaseTransaction,
  organizationId: string,
  apiServiceId: string,
  normalizedDigest: string,
): Promise<SpecificationRecord | null> {
  const [spec] = await tx
    .select()
    .from(apiSpecs)
    .where(
      and(
        eq(apiSpecs.organizationId, organizationId),
        eq(apiSpecs.apiServiceId, apiServiceId),
        eq(apiSpecs.normalizedDigest, normalizedDigest),
      ),
    )
    .limit(1);
  if (!spec) return null;
  const operations = await tx
    .select({
      id: apiOperations.id,
      httpMethod: apiOperations.httpMethod,
      normalizedPathTemplate: apiOperations.normalizedPathTemplate,
      operationKey: apiOperations.operationKey,
      operationId: apiSpecOperations.operationIdText,
      summary: apiSpecOperations.summary,
      contractDigest: apiSpecOperations.contractDigest,
    })
    .from(apiSpecOperations)
    .innerJoin(apiOperations, eq(apiOperations.id, apiSpecOperations.apiOperationId))
    .where(
      and(
        eq(apiSpecOperations.organizationId, organizationId),
        eq(apiSpecOperations.apiSpecId, spec.id),
      ),
    )
    .orderBy(apiOperations.normalizedPathTemplate, apiOperations.httpMethod);
  return {
    id: spec.id,
    apiServiceId: spec.apiServiceId,
    versionLabel: spec.versionLabel,
    source: spec.source,
    originalDigest: spec.originalDigest,
    normalizedDigest: spec.normalizedDigest,
    openapiVersion: spec.openapiVersion,
    validationStatus: spec.validationStatus,
    validationErrors: Array.isArray(spec.validationErrors)
      ? spec.validationErrors.filter((value): value is string => typeof value === "string")
      : [],
    isCurrent: spec.isCurrent,
    supersedesSpecId: spec.supersedesSpecId,
    createdAt: spec.createdAt,
    operations,
  };
}

export async function findApiSpecificationByDigest(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  normalizedDigest: string,
): Promise<SpecificationRecord | null> {
  return withOrganizationContext(db, organizationId, (tx) =>
    readSpecification(tx, organizationId, apiServiceId, normalizedDigest),
  );
}

async function registerObject(
  tx: DatabaseTransaction,
  organizationId: string,
  actor: SpecificationActor,
  object: StoredObjectDescriptor,
): Promise<string> {
  const now = new Date();
  const [inserted] = await tx
    .insert(storedObjects)
    .values({
      organizationId,
      kind: "api_spec",
      bucket: object.bucket,
      objectKey: object.objectKey,
      contentType: object.contentType,
      contentEncoding: object.contentEncoding,
      byteSize: BigInt(object.byteSize),
      sha256Digest: object.sha256Digest,
      scanStatus: "clean",
      scannedAt: now,
      availabilityStatus: "available",
      verifiedAt: now,
      createdByActorType: "user",
      createdByActorId: actor.userId,
    })
    .onConflictDoNothing({
      target: [storedObjects.organizationId, storedObjects.kind, storedObjects.sha256Digest],
      where: sql`${storedObjects.deletedAt} is null and ${storedObjects.availabilityStatus} <> 'quarantined'`,
    })
    .returning({ id: storedObjects.id });
  if (inserted) return inserted.id;
  const [existing] = await tx
    .select({ id: storedObjects.id })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.organizationId, organizationId),
        eq(storedObjects.kind, "api_spec"),
        eq(storedObjects.sha256Digest, object.sha256Digest),
        eq(storedObjects.availabilityStatus, "available"),
        sql`${storedObjects.deletedAt} is null`,
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Unable to register verified specification object");
  return existing.id;
}

export async function persistApiSpecification(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  actor: SpecificationActor,
  input: SpecificationInput,
  originalObject: StoredObjectDescriptor,
  normalizedObject: StoredObjectDescriptor,
): Promise<{
  created: boolean;
  specification: SpecificationRecord;
  retainedObjectKeys: string[];
}> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${apiServiceId}, 0))`);
    const [service] = await tx
      .select({ id: apiServices.id })
      .from(apiServices)
      .where(and(eq(apiServices.organizationId, organizationId), eq(apiServices.id, apiServiceId)))
      .limit(1);
    if (!service) throw new Error("Service not found");
    const existing = await readSpecification(
      tx,
      organizationId,
      apiServiceId,
      input.normalizedDigest,
    );
    if (existing) return { created: false, specification: existing, retainedObjectKeys: [] };

    const originalObjectId = await registerObject(tx, organizationId, actor, originalObject);
    const normalizedObjectId =
      originalObject.sha256Digest === normalizedObject.sha256Digest
        ? originalObjectId
        : await registerObject(tx, organizationId, actor, normalizedObject);
    const [current] = await tx
      .select({ id: apiSpecs.id })
      .from(apiSpecs)
      .where(
        and(
          eq(apiSpecs.organizationId, organizationId),
          eq(apiSpecs.apiServiceId, apiServiceId),
          eq(apiSpecs.isCurrent, true),
        ),
      )
      .orderBy(desc(apiSpecs.createdAt))
      .limit(1);
    if (current) {
      await tx.update(apiSpecs).set({ isCurrent: false }).where(eq(apiSpecs.id, current.id));
    }
    const [createdSpec] = await tx
      .insert(apiSpecs)
      .values({
        organizationId,
        apiServiceId,
        versionLabel: input.versionLabel,
        source: "upload",
        originalObjectId,
        normalizedObjectId,
        originalDigest: input.originalDigest,
        normalizedDigest: input.normalizedDigest,
        openapiVersion: input.openapiVersion,
        validationStatus: "valid",
        validationErrors: [],
        isCurrent: true,
        supersedesSpecId: current?.id ?? null,
        uploadedByMembershipId: actor.membershipId,
      })
      .returning();
    if (!createdSpec) throw new Error("Specification creation returned no record");

    const now = new Date();
    for (const operation of input.operations) {
      const [savedOperation] = await tx
        .insert(apiOperations)
        .values({
          organizationId,
          apiServiceId,
          httpMethod: operation.httpMethod,
          normalizedPathTemplate: operation.normalizedPathTemplate,
          operationKey: operation.operationKey,
          displayName: operation.operationId ?? operation.summary,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [
            apiOperations.apiServiceId,
            apiOperations.httpMethod,
            apiOperations.normalizedPathTemplate,
          ],
          set: {
            operationKey: operation.operationKey,
            displayName: operation.operationId ?? operation.summary,
            lastSeenAt: now,
            archivedAt: null,
            updatedAt: now,
          },
        })
        .returning({ id: apiOperations.id });
      if (!savedOperation) throw new Error("Operation mapping returned no record");
      await tx.insert(apiSpecOperations).values({
        organizationId,
        apiSpecId: createdSpec.id,
        apiOperationId: savedOperation.id,
        operationIdText: operation.operationId,
        summary: operation.summary,
        normalizedContract: operation.normalizedContract,
        contractDigest: operation.contractDigest,
      });
    }

    await tx
      .update(onboardingProgress)
      .set({
        currentStep: "capture",
        completedSteps: sql`array(select distinct unnest(${onboardingProgress.completedSteps} || ARRAY['specification']::text[]))`,
        lastErrorCode: null,
        updatedAt: now,
      })
      .where(eq(onboardingProgress.apiServiceId, apiServiceId));
    const event = {
      serviceId: apiServiceId,
      specificationId: createdSpec.id,
      normalizedDigest: input.normalizedDigest,
      operationCount: input.operations.length,
    };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "specification.activated",
        resourceType: "api_spec",
        resourceId: createdSpec.id,
        requestId: actor.requestId,
        changes: event,
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId,
        topic: "specification.activated",
        aggregateType: "api_spec",
        aggregateId: createdSpec.id,
        eventVersion: 1,
        payload: event,
        payloadDigest: payloadDigest(event),
      }),
    ]);
    const specification = await readSpecification(
      tx,
      organizationId,
      apiServiceId,
      input.normalizedDigest,
    );
    if (!specification) throw new Error("Created specification could not be read");
    const retainedObjects = await tx
      .select({ objectKey: storedObjects.objectKey })
      .from(storedObjects)
      .where(
        and(
          eq(storedObjects.organizationId, organizationId),
          sql`${storedObjects.id} in (${originalObjectId}, ${normalizedObjectId})`,
        ),
      );
    return {
      created: true,
      specification,
      retainedObjectKeys: retainedObjects.map(({ objectKey }) => objectKey),
    };
  });
}
