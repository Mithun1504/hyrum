import {
  type ClaimedJob,
  type DatabaseTransaction,
  expireAssertion,
  remindAssertionExpiry,
} from "@hyrum/db";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ assertionId: z.uuid() });

export const remindAssertionExpiryHandler: JobHandler = async (job: ClaimedJob, context) => {
  if (!context.organizationId) throw new Error("Assertion reminder must be tenant scoped");
  const payload = payloadSchema.parse(job.payload);
  await remindAssertionExpiry(
    context.db as DatabaseTransaction,
    context.organizationId,
    payload.assertionId,
  );
};

export const expireAssertionHandler: JobHandler = async (job: ClaimedJob, context) => {
  if (!context.organizationId) throw new Error("Assertion expiry must be tenant scoped");
  const payload = payloadSchema.parse(job.payload);
  await expireAssertion(
    context.db as DatabaseTransaction,
    context.organizationId,
    payload.assertionId,
  );
};
