import { type ClaimedJob, type DatabaseTransaction, routeNotification } from "@hyrum/db";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ notificationId: z.uuid() });

export const routeNotificationHandler: JobHandler = async (job: ClaimedJob, context) => {
  if (!context.organizationId) throw new Error("Notification jobs must be tenant scoped");
  const { notificationId } = payloadSchema.parse(job.payload);
  await routeNotification(
    context.db as DatabaseTransaction,
    context.organizationId,
    notificationId,
  );
};
