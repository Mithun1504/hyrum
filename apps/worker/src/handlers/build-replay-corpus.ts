import { createHash } from "node:crypto";
import { processedCaptureSessionSchema } from "@hyrum/contracts";
import {
  type ClaimedJob,
  type CorpusCandidate,
  type CorpusItemInput,
  type DatabaseTransaction,
  listCorpusCandidates,
  persistReplayCorpus,
} from "@hyrum/db";
import type { ObjectStorage } from "@hyrum/storage";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({
  apiServiceId: z.uuid(),
  reason: z.string().trim().min(1).max(100).optional(),
  assertionId: z.uuid().optional(),
});

const receiptBundleSchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  extractorReleaseId: z.uuid(),
  redactionPolicyVersionId: z.uuid(),
  session: processedCaptureSessionSchema,
});

interface SelectedRequest {
  candidate: CorpusCandidate;
  request: {
    method: string;
    path: string;
    normalized_path: string;
    headers?: Record<string, string[]>;
    query?: Record<string, unknown>;
    body?: unknown;
  };
  requestDigest: string;
  safeMethod: boolean;
  requiresFixture: boolean;
  selectionReason: string;
}

const MAX_RECEIPT_BYTES = 16 * 1_024 * 1_024;
const MAX_CORPUS_ITEMS = 2_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedPath(operationKey: string, observedPath: string): string {
  const separator = operationKey.indexOf(" ");
  const template = separator >= 0 ? operationKey.slice(separator + 1).trim() : operationKey.trim();
  return template.startsWith("/") ? template : observedPath;
}

function candidateKey(candidate: CorpusCandidate): string {
  if (candidate.assertionId) return `0:${candidate.assertionId}:${candidate.consumerId}`;
  return `1:${candidate.apiOperationId}:${candidate.consumerId}:${candidate.coverageClass}`;
}

async function selectRequests(
  storage: ObjectStorage,
  organizationId: string,
  candidates: readonly CorpusCandidate[],
  signal: AbortSignal,
): Promise<SelectedRequest[]> {
  const mandatoryAssertionCases = new Set(
    candidates.flatMap((candidate) =>
      candidate.assertionId ? [`${candidate.assertionId}:${candidate.consumerId}`] : [],
    ),
  );
  if (mandatoryAssertionCases.size > MAX_CORPUS_ITEMS) {
    throw new Error("Active assertion coverage exceeds the corpus item limit");
  }
  const selected = new Map<string, SelectedRequest>();
  const bundles = new Map<string, z.infer<typeof receiptBundleSchema>>();
  for (const candidate of candidates) {
    if (signal.aborted) throw signal.reason;
    const key = candidateKey(candidate);
    if (selected.has(key)) continue;
    let bundle = bundles.get(candidate.objectKey);
    if (!bundle) {
      if (candidate.byteSize > MAX_RECEIPT_BYTES) {
        throw new Error("Receipt bundle exceeds the corpus builder read limit");
      }
      const body = await storage.read(organizationId, candidate.objectKey, candidate.byteSize);
      bundle = receiptBundleSchema.parse(JSON.parse(new TextDecoder().decode(body)));
      bundles.set(candidate.objectKey, bundle);
    }
    if (bundle.extractorReleaseId !== candidate.extractorReleaseId) {
      throw new Error("Receipt extractor metadata does not match its database record");
    }
    const exchange = bundle.session.exchanges.find(
      ({ operation_key }) => operation_key === candidate.operationKey,
    );
    if (!exchange) continue;
    const request = {
      method: exchange.request_method,
      path: exchange.request_path,
      normalized_path:
        candidate.normalizedPathTemplate ||
        normalizedPath(candidate.operationKey, exchange.request_path),
      ...(exchange.request_headers ? { headers: exchange.request_headers } : {}),
      ...(exchange.request_query ? { query: exchange.request_query } : {}),
      ...(exchange.request_body !== undefined ? { body: exchange.request_body } : {}),
    };
    const capturedRequestDigest = createHash("sha256").update(stableJson(request)).digest("hex");
    // An assertion is a distinct immutable replay test case even when another behavior uses the
    // same captured request. Salting its manifest digest keeps every assertion independently
    // addressable without changing the redacted request bytes.
    const requestDigest = candidate.assertionId
      ? createHash("sha256")
          .update(`${capturedRequestDigest}:assertion:${candidate.assertionId}`)
          .digest("hex")
      : capturedRequestDigest;
    const safeMethod = SAFE_METHODS.has(exchange.request_method);
    selected.set(key, {
      candidate,
      request,
      requestDigest,
      safeMethod,
      requiresFixture: !safeMethod,
      selectionReason: candidate.assertionId
        ? `active-assertion:${candidate.assertionId}`
        : `coverage:${candidate.coverageClass}`,
    });
    if (selected.size >= MAX_CORPUS_ITEMS) break;
  }
  return [...selected.values()].sort((left, right) =>
    candidateKey(left.candidate).localeCompare(candidateKey(right.candidate)),
  );
}

function serializeCorpus(selected: readonly SelectedRequest[]): {
  body: Uint8Array;
  items: CorpusItemInput[];
} {
  const header = `${stableJson({ format: "hyrum-replay-corpus", schema_version: 1 })}\n`;
  const chunks = [header];
  const items: CorpusItemInput[] = [];
  let offset = Buffer.byteLength(header);
  const seen = new Set<string>();
  for (const [index, selectedRequest] of selected.entries()) {
    const uniquenessKey = `${selectedRequest.requestDigest}:${selectedRequest.candidate.coverageClass}`;
    if (seen.has(uniquenessKey)) continue;
    seen.add(uniquenessKey);
    const line = `${stableJson({
      assertion_id: selectedRequest.candidate.assertionId,
      api_operation_id: selectedRequest.candidate.apiOperationId,
      behavior_definition_id: selectedRequest.candidate.behaviorDefinitionId,
      behavior_kind: selectedRequest.candidate.behaviorKind,
      consumer_id: selectedRequest.candidate.consumerId,
      coverage_class: selectedRequest.candidate.coverageClass,
      operation_key: selectedRequest.candidate.operationKey,
      request: selectedRequest.request,
      request_digest: selectedRequest.requestDigest,
      requires_fixture: selectedRequest.requiresFixture,
    })}\n`;
    items.push({
      apiOperationId: selectedRequest.candidate.apiOperationId,
      consumerId: selectedRequest.candidate.consumerId,
      behaviorDefinitionId: selectedRequest.candidate.behaviorDefinitionId,
      assertionId: selectedRequest.candidate.assertionId,
      coverageClass: selectedRequest.candidate.coverageClass,
      objectOffset: BigInt(offset),
      requestDigest: selectedRequest.requestDigest,
      method: selectedRequest.request.method,
      normalizedPath: selectedRequest.request.normalized_path,
      safeMethod: selectedRequest.safeMethod,
      requiresFixture: selectedRequest.requiresFixture,
      selectionReason: selectedRequest.selectionReason,
      priorityRank: index + 1,
    });
    chunks.push(line);
    offset += Buffer.byteLength(line);
  }
  return { body: new TextEncoder().encode(chunks.join("")), items };
}

export function createBuildReplayCorpusHandler(storage: ObjectStorage): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Corpus jobs must be tenant scoped");
    const payload = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const candidates = await listCorpusCandidates(tx, context.organizationId, payload.apiServiceId);
    if (candidates.length === 0) {
      if (payload.assertionId) throw new Error("Pinned assertion has no replayable receipt yet");
      return;
    }
    const selected = await selectRequests(
      storage,
      context.organizationId,
      candidates,
      context.signal,
    );
    if (selected.length === 0)
      throw new Error("No readable requests were available for corpus creation");
    const serialized = serializeCorpus(selected);
    if (serialized.items.length === 0) return;
    if (
      payload.assertionId &&
      !serialized.items.some(({ assertionId }) => assertionId === payload.assertionId)
    ) {
      throw new Error("Pinned assertion was not included in the generated replay corpus");
    }
    const uploaded = await storage.put({
      organizationId: context.organizationId,
      purpose: "replay-corpus",
      body: serialized.body,
      contentType: "application/x-ndjson",
    });
    try {
      await storage.verify(uploaded);
      const observedAt = selected.map(({ candidate }) => candidate.observedAt.getTime());
      const start = new Date(Math.min(...observedAt));
      const end = new Date(Math.max(Math.max(...observedAt), start.getTime() + 1));
      const result = await persistReplayCorpus(
        tx,
        context.organizationId,
        payload.apiServiceId,
        uploaded,
        serialized.items,
        { start, end },
      );
      if (!result.created || result.retainedObjectKey !== uploaded.objectKey) {
        await storage.delete(context.organizationId, uploaded.objectKey);
      }
    } catch (error) {
      await storage.delete(context.organizationId, uploaded.objectKey).catch(() => undefined);
      throw error;
    }
  };
}
