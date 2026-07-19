import {
  apiSpecSchema,
  assertionListItemSchema,
  assertionSchema,
  type CaptureBatch,
  type CreateCorpusItemRequest,
  type CreateReplayCorpusRequest,
  captureBatchResponseSchema,
  claimOverrideResponseSchema,
  consumerListResponseSchema,
  corpusItemSchema,
  gatePolicySchema,
  healthResponseSchema,
  ledgerListResponseSchema,
  type OverrideDependencyClaimRequest,
  type PinAssertionRequest,
  type PrepareCorpusUploadRequest,
  type ProblemDetails,
  prepareCorpusUploadResponseSchema,
  problemDetailsSchema,
  progressEventListSchema,
  type ReplayReport,
  type ResolveAssertionRequest,
  receiptSchema,
  replayCorpusSchema,
  replayReportResponseSchema,
  replayRunDetailResponseSchema,
  sessionResponseSchema,
  type UpdateCorpusItemRequest,
  type UpdateReplayCorpusRequest,
  type UploadApiSpecRequest,
  type UpsertGatePolicyRequest,
  workspaceSummarySchema,
} from "@hyrum/contracts";
import { z } from "zod";

export {
  type ProgressEventTopic,
  progressEventTopic,
  progressEventTopicSchema,
  progressEventTopics,
} from "@hyrum/contracts";
export type * from "./generated";

export class ControlPlaneError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.error);
    this.name = "ControlPlaneError";
  }
}

export interface ControlPlaneClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

export type LedgerListQuery = {
  q?: string;
  tier?: "T1" | "T2" | "T3";
  kind?: "shape" | "ordering" | "error" | "status";
  state?: "active" | "stale" | "dismissed";
  cursor?: string;
  limit?: number;
};

export type ConsumerListQuery = { q?: string; cursor?: string; limit?: number };

function withQuery(path: string, query: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

const assertionListSchema = z.object({ assertions: z.array(assertionListItemSchema) });
const corpusListSchema = z.object({ corpora: z.array(replayCorpusSchema) });
const advisoryResponseSchema = z.object({
  role: z.enum(["behavior_clusters", "tier_proposals", "replay_priorities", "impact_explanations"]),
  run_id: z.uuid(),
  model: z.string(),
  prompt_version: z.string(),
  result: z.unknown(),
});

export function createControlPlaneClient(options: ControlPlaneClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request(path: string, init: RequestInit = {}) {
    const accessToken = await options.getAccessToken?.();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

    const response = await fetcher(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const fallback = {
        type: "about:blank",
        title: "Control plane request failed",
        status: response.status,
        error: "Control plane request failed",
        code: "request_failed",
      };
      const body: unknown = await response.json().catch(() => fallback);
      const problem = problemDetailsSchema.safeParse(body);
      throw new ControlPlaneError(problem.success ? problem.data : fallback);
    }
    return response;
  }

  const jsonBody = (body: unknown) => JSON.stringify(body);

  return {
    async health() {
      const response = await request("/health");
      return healthResponseSchema.parse(await response.json());
    },
    async ingestCaptureBatch(batch: CaptureBatch) {
      const response = await request("/v1/capture/batches", {
        method: "POST",
        body: jsonBody(batch),
      });
      return captureBatchResponseSchema.parse(await response.json());
    },
    async session() {
      const response = await request("/v1/session");
      return sessionResponseSchema.parse(await response.json());
    },
    async uploadApiSpec(body: UploadApiSpecRequest) {
      const response = await request("/v1/api-specs", {
        method: "POST",
        body: jsonBody(body),
      });
      return apiSpecSchema.parse(await response.json());
    },
    async listLedgerPage(query: LedgerListQuery = {}) {
      const response = await request(withQuery("/v1/ledger", query));
      return ledgerListResponseSchema.parse(await response.json());
    },
    async listLedger(query: Omit<LedgerListQuery, "cursor"> = {}) {
      const entries = [];
      let cursor: string | null = null;
      let total = 0;
      do {
        const page = await this.listLedgerPage({
          ...query,
          ...(cursor ? { cursor } : {}),
          limit: 100,
        });
        entries.push(...page.entries);
        total = page.total;
        cursor = page.next_cursor;
      } while (cursor);
      return { entries, next_cursor: null, total };
    },
    async listConsumersPage(query: ConsumerListQuery = {}) {
      const response = await request(withQuery("/v1/consumers", query));
      return consumerListResponseSchema.parse(await response.json());
    },
    async listConsumers(query: Omit<ConsumerListQuery, "cursor"> = {}) {
      const consumers = [];
      let cursor: string | null = null;
      let total = 0;
      do {
        const page = await this.listConsumersPage({
          ...query,
          ...(cursor ? { cursor } : {}),
          limit: 100,
        });
        consumers.push(...page.consumers);
        total = page.total;
        cursor = page.next_cursor;
      } while (cursor);
      return { consumers, next_cursor: null, total };
    },
    async getWorkspaceSummary() {
      const response = await request("/v1/workspace/summary");
      return workspaceSummarySchema.parse(await response.json());
    },
    async listProgressEvents(limit = 20) {
      const response = await request(`/v1/progress?limit=${encodeURIComponent(String(limit))}`);
      return progressEventListSchema.parse(await response.json()).events;
    },
    async getReceipt(id: string) {
      const response = await request(`/v1/receipts/${id}`);
      return receiptSchema.parse(await response.json());
    },
    async pinAssertion(body: PinAssertionRequest) {
      const response = await request("/v1/assertions", {
        method: "POST",
        body: jsonBody(body),
      });
      return assertionSchema.parse(await response.json());
    },
    async resolveAssertion(id: string, body: ResolveAssertionRequest) {
      const response = await request(`/v1/assertions/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        body: jsonBody(body),
      });
      return assertionSchema.parse(await response.json());
    },
    async overrideDependencyClaim(id: string, body: OverrideDependencyClaimRequest) {
      const response = await request(`/v1/claims/${encodeURIComponent(id)}/override`, {
        method: "PUT",
        body: jsonBody(body),
      });
      return claimOverrideResponseSchema.parse(await response.json());
    },
    async listAssertions() {
      const response = await request("/v1/assertions");
      return assertionListSchema.parse(await response.json()).assertions;
    },
    async getPolicy() {
      const response = await request("/v1/policy");
      return gatePolicySchema.parse(await response.json());
    },
    async updatePolicy(body: UpsertGatePolicyRequest) {
      const response = await request("/v1/policy", {
        method: "PUT",
        body: jsonBody(body),
      });
      return gatePolicySchema.parse(await response.json());
    },
    async listReplayCorpora() {
      const response = await request("/v1/replay/corpora");
      return corpusListSchema.parse(await response.json()).corpora;
    },
    async prepareCorpusUpload(body: PrepareCorpusUploadRequest) {
      const response = await request("/v1/replay/corpora/uploads", {
        method: "POST",
        body: jsonBody(body),
      });
      return prepareCorpusUploadResponseSchema.parse(await response.json());
    },
    async createReplayCorpus(body: CreateReplayCorpusRequest) {
      const response = await request("/v1/replay/corpora", {
        method: "POST",
        body: jsonBody(body),
      });
      return replayCorpusSchema.parse(await response.json());
    },
    async addCorpusItem(corpusId: string, body: CreateCorpusItemRequest) {
      const response = await request(`/v1/replay/corpora/${encodeURIComponent(corpusId)}/items`, {
        method: "POST",
        body: jsonBody(body),
      });
      return corpusItemSchema.parse(await response.json());
    },
    async updateCorpusItem(corpusId: string, itemId: string, body: UpdateCorpusItemRequest) {
      const response = await request(
        `/v1/replay/corpora/${encodeURIComponent(corpusId)}/items/${encodeURIComponent(itemId)}`,
        { method: "PATCH", body: jsonBody(body) },
      );
      return corpusItemSchema.parse(await response.json());
    },
    async updateReplayCorpus(corpusId: string, body: UpdateReplayCorpusRequest) {
      const response = await request(`/v1/replay/corpora/${encodeURIComponent(corpusId)}`, {
        method: "PATCH",
        body: jsonBody(body),
      });
      return replayCorpusSchema.parse(await response.json());
    },
    async runModelAdvisory(
      role: "behavior_clusters" | "tier_proposals" | "replay_priorities" | "impact_explanations",
      entityIds: string[],
    ) {
      const response = await request(`/v1/model-assistance/${role}`, {
        method: "POST",
        body: jsonBody({ entity_ids: entityIds }),
        signal: AbortSignal.timeout(15_000),
      });
      return advisoryResponseSchema.parse(await response.json());
    },
    async ingestReplayReport(report: ReplayReport) {
      const response = await request("/v1/replay/reports", {
        method: "POST",
        body: jsonBody(report),
      });
      return replayReportResponseSchema.parse(await response.json());
    },
    async getLatestReplayRun() {
      const response = await request("/v1/replay/runs/latest");
      return replayRunDetailResponseSchema.parse(await response.json());
    },
    async getReplayRun(id: string) {
      const response = await request(`/v1/replay/runs/${id}`);
      return replayRunDetailResponseSchema.parse(await response.json());
    },
  };
}
