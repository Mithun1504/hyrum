import {
  apiSpecSchema,
  assertionSchema,
  type CaptureBatch,
  captureBatchResponseSchema,
  consumerSchema,
  gatePolicySchema,
  healthResponseSchema,
  ledgerEntrySchema,
  type PinAssertionRequest,
  type ProblemDetails,
  problemDetailsSchema,
  progressEventListSchema,
  type ReplayReport,
  receiptSchema,
  replayReportResponseSchema,
  replayRunDetailResponseSchema,
  sessionResponseSchema,
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

const ledgerListSchema = z.object({ entries: z.array(ledgerEntrySchema) });
const consumerListSchema = z.object({ consumers: z.array(consumerSchema) });
const assertionListSchema = z.object({ assertions: z.array(assertionSchema) });

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
      const response = await request("/v1/api-specs", { method: "POST", body: jsonBody(body) });
      return apiSpecSchema.parse(await response.json());
    },
    async listLedger() {
      const response = await request("/v1/ledger");
      return ledgerListSchema.parse(await response.json()).entries;
    },
    async listConsumers() {
      const response = await request("/v1/consumers");
      return consumerListSchema.parse(await response.json()).consumers;
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
      const response = await request("/v1/assertions", { method: "POST", body: jsonBody(body) });
      return assertionSchema.parse(await response.json());
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
      const response = await request("/v1/policy", { method: "PUT", body: jsonBody(body) });
      return gatePolicySchema.parse(await response.json());
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
