import {
  type ClaimedJob,
  type Database,
  type DatabaseTransaction,
  listDeletingOrganizations,
  listOrganizationObjectKeys,
  markOrganizationDeletionPrepared,
  prepareOrganizationDeletion,
  purgeOrganizationRecords,
} from "@hyrum/db";
import type { ObjectStorage } from "@hyrum/storage";
import { z } from "zod";
import type { JobHandler } from "../runner";

const preparePayloadSchema = z.strictObject({ dataSubjectRequestId: z.uuid() });

export function createPrepareOrganizationDeletionHandler(storage: ObjectStorage): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Deletion preparation must be tenant scoped");
    const payload = preparePayloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const manifest = await prepareOrganizationDeletion(
      tx,
      context.organizationId,
      payload.dataSubjectRequestId,
    );
    if (!manifest) return;
    const uploaded = await storage.put({
      organizationId: context.organizationId,
      purpose: "deletion-manifest",
      body: new TextEncoder().encode(JSON.stringify(manifest)),
      contentType: "application/json",
    });
    try {
      await storage.verify(uploaded);
      await markOrganizationDeletionPrepared(
        tx,
        context.organizationId,
        payload.dataSubjectRequestId,
        uploaded,
      );
    } catch (error) {
      await storage.delete(context.organizationId, uploaded.objectKey).catch(() => undefined);
      throw error;
    }
  };
}

export function createPurgeDeletingOrganizationsHandler(storage: ObjectStorage): JobHandler {
  return async (_job, context) => {
    if (context.organizationId) throw new Error("Organization purge must be platform scoped");
    const db = context.db as Database;
    const organizations = await listDeletingOrganizations(db);
    for (const organization of organizations) {
      if (context.signal.aborted) throw context.signal.reason;
      const objects = await listOrganizationObjectKeys(db, organization.id);
      for (const object of objects) {
        if (context.signal.aborted) throw context.signal.reason;
        await storage.delete(organization.id, object.objectKey);
      }
      await purgeOrganizationRecords(db, organization.id);
    }
  };
}
