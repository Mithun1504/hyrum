import {
  type ClaimedJob,
  type DatabaseTransaction,
  listExpiredObjects,
  markObjectRetentionDeleted,
  refreshLedgerFreshness,
} from "@hyrum/db";
import type { ObjectStorage } from "@hyrum/storage";
import type { JobHandler } from "../runner";

export const refreshLedgerFreshnessHandler: JobHandler = async (_job: ClaimedJob, context) => {
  if (!context.organizationId) throw new Error("Ledger freshness jobs must be tenant scoped");
  await refreshLedgerFreshness(context.db as DatabaseTransaction, context.organizationId);
};

export function createEnforceObjectRetentionHandler(storage: ObjectStorage): JobHandler {
  return async (_job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Retention jobs must be tenant scoped");
    const tx = context.db as DatabaseTransaction;
    const expired = await listExpiredObjects(tx, context.organizationId);
    for (const object of expired) {
      if (context.signal.aborted) throw context.signal.reason;
      await storage.delete(context.organizationId, object.objectKey);
      await markObjectRetentionDeleted(tx, context.organizationId, object.id);
    }
  };
}
