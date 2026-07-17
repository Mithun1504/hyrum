import { createHash } from "node:crypto";
import { processedCaptureSessionSchema } from "@hyrum/contracts";
import {
  type ClaimedJob,
  type DatabaseTransaction,
  getIngestionBatchServiceId,
  getProcessableIngestionBatch,
  inferDeterministicClaims,
  listBehaviorsForCurrentSpecClassification,
  persistBehaviorSpecClassifications,
  processIngestionSessions,
} from "@hyrum/db";
import { classifyBehaviorFingerprint } from "@hyrum/specs";
import type { ObjectStorage } from "@hyrum/storage";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ ingestionBatchId: z.uuid() });
const storedBatchSchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  extractorReleaseId: z.uuid(),
  redactionPolicyVersionId: z.uuid(),
  samplingPolicyVersionId: z.uuid(),
  sessions: z.array(processedCaptureSessionSchema).min(1).max(500),
});

export function createProcessIngestionBatchHandler(storage: ObjectStorage): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Ingestion jobs must be tenant scoped");
    if (context.signal.aborted) throw context.signal.reason;
    const payload = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const batch = await getProcessableIngestionBatch(
      tx,
      context.organizationId,
      payload.ingestionBatchId,
    );
    if (!batch) return;
    if (batch.bucket !== storage.bucket) throw new Error("Capture object bucket is not configured");
    if (batch.byteSize > 16 * 1_024 * 1_024)
      throw new Error("Capture object exceeds processing limit");
    const body = await storage.read(context.organizationId, batch.objectKey, batch.byteSize);
    if (context.signal.aborted) throw context.signal.reason;
    const envelope = storedBatchSchema.parse(JSON.parse(new TextDecoder().decode(body)));
    const uploadedReceiptBundles: Array<
      readonly [string, Awaited<ReturnType<ObjectStorage["put"]>>]
    > = [];
    try {
      for (const session of envelope.sessions) {
        const receiptBundle = await storage.put({
          organizationId: context.organizationId,
          purpose: "receipt-bundle",
          body: new TextEncoder().encode(
            JSON.stringify({
              schemaVersion: envelope.schemaVersion,
              extractorReleaseId: envelope.extractorReleaseId,
              redactionPolicyVersionId: envelope.redactionPolicyVersionId,
              session,
            }),
          ),
          contentType: "application/json",
        });
        await storage.verify(receiptBundle);
        uploadedReceiptBundles.push([session.session_hmac, receiptBundle] as const);
      }
      const processed = await processIngestionSessions(
        tx,
        context.organizationId,
        payload.ingestionBatchId,
        envelope.sessions,
        new Map(uploadedReceiptBundles),
      );
      const serviceId = await getIngestionBatchServiceId(
        tx,
        context.organizationId,
        payload.ingestionBatchId,
      );
      if (!serviceId) throw new Error("Processed ingestion batch has no service");
      const behaviors = await listBehaviorsForCurrentSpecClassification(
        tx,
        context.organizationId,
        serviceId,
      );
      await persistBehaviorSpecClassifications(
        tx,
        context.organizationId,
        behaviors.map((behavior) => {
          const result = classifyBehaviorFingerprint(
            behavior.kind,
            behavior.canonicalFingerprint,
            behavior.normalizedContract,
          );
          return {
            behaviorDefinitionId: behavior.behaviorDefinitionId,
            apiSpecId: behavior.apiSpecId,
            status: result.status,
            reasonCode: result.reasonCode,
            comparisonDetails: result.details,
            comparatorVersion: "spec-subtraction-v1",
          };
        }),
      );
      const artifacts = [];
      for (const session of envelope.sessions) {
        const receiptBundle = uploadedReceiptBundles.find(
          ([sessionHmac]) => sessionHmac === session.session_hmac,
        )?.[1];
        if (!receiptBundle) throw new Error("Processed session has no bounded receipt bundle");
        const receiptTypes = [
          ...(session.extraction.fingerprints.length > 0 ? (["exposure"] as const) : []),
          ...(session.completeness === "complete" &&
          session.extraction.fingerprints.some(({ kind }) => kind === "error_template")
            ? (["t2_pattern"] as const)
            : []),
          ...((session.extraction.echoes?.length ?? 0) > 0 ? (["t1_echo"] as const) : []),
        ];
        for (const receiptType of receiptTypes) {
          artifacts.push({
            sessionHmac: session.session_hmac,
            receiptType,
            ...receiptBundle,
            bundleDigest: createHash("sha256")
              .update(`${receiptBundle.sha256Digest}:${receiptType}`)
              .digest("hex"),
          });
        }
      }
      await inferDeterministicClaims(
        tx,
        context.organizationId,
        payload.ingestionBatchId,
        envelope.sessions,
        artifacts,
      );
      const retained = new Set(processed.retainedReceiptObjectKeys);
      for (const [, object] of uploadedReceiptBundles) {
        if (!retained.has(object.objectKey)) {
          await storage.delete(context.organizationId, object.objectKey);
        }
      }
    } catch (error) {
      await Promise.allSettled(
        uploadedReceiptBundles.map(([, object]) =>
          storage.delete(context.organizationId as string, object.objectKey),
        ),
      );
      throw error;
    }
  };
}
