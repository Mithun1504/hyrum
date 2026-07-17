import {
  type ClaimedJob,
  completeOrganizationExport,
  type DatabaseTransaction,
  prepareOrganizationExport,
} from "@hyrum/db";
import type { ObjectStorage } from "@hyrum/storage";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ dataSubjectRequestId: z.uuid() });

export function createExportOrganizationDataHandler(storage: ObjectStorage): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Organization exports must be tenant scoped");
    const payload = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const exportData = await prepareOrganizationExport(
      tx,
      context.organizationId,
      payload.dataSubjectRequestId,
    );
    if (!exportData) return;
    const body = new TextEncoder().encode(JSON.stringify(exportData, null, 2));
    const stored = await storage.put({
      organizationId: context.organizationId,
      purpose: "generated-artifact",
      body,
      contentType: "application/json",
    });
    try {
      await storage.verify(stored);
      await completeOrganizationExport(
        tx,
        context.organizationId,
        payload.dataSubjectRequestId,
        stored,
      );
    } catch (error) {
      await storage.delete(context.organizationId, stored.objectKey).catch(() => undefined);
      throw error;
    }
  };
}
