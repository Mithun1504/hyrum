import { createHmac } from "node:crypto";
import sensible from "@fastify/sensible";
import {
  claimWebhookDelivery,
  finishProviderWebhook,
  resolveGitHubInstallation,
  syncGitHubPullRequest,
  syncGitHubRepository,
} from "@hyrum/db";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { githubWebhookRoutes } from "./github-webhooks";

vi.mock("@hyrum/db", () => ({
  claimWebhookDelivery: vi.fn(),
  finishProviderWebhook: vi.fn(),
  resolveGitHubInstallation: vi.fn(),
  syncGitHubPullRequest: vi.fn(),
  syncGitHubRepository: vi.fn(),
}));

const secret = "github-webhook-test-secret";
const organizationId = "019f6307-59e3-73ea-95ee-772dc5397444";
const installationId = "019f6307-a4aa-7a72-b1cb-e6e122de3cb8";
const payload = {
  installation: { id: 1234 },
  repository: { id: 9876, name: "api", full_name: "example/api", default_branch: "main" },
  pull_request: {
    id: 42,
    number: 7,
    state: "open",
    user: { login: "engineer" },
    head: { sha: "a".repeat(40), repo: { id: 9876 } },
    base: { sha: "b".repeat(40), repo: { id: 9876 } },
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:01:00.000Z",
    closed_at: null,
  },
};

async function buildWebhookApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensible);
  await app.register(rawBody, { global: false, encoding: "utf8", runFirst: true });
  app.decorate("database", { db: {}, sql: {}, close: vi.fn() } as never);
  vi.mocked(claimWebhookDelivery).mockResolvedValue(true);
  vi.mocked(resolveGitHubInstallation).mockResolvedValue({ organizationId, installationId });
  vi.mocked(syncGitHubRepository).mockResolvedValue({} as never);
  vi.mocked(syncGitHubPullRequest).mockResolvedValue({} as never);
  await app.register(githubWebhookRoutes, { webhookSecret: secret });
  return app;
}

function signature(body: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("POST /webhooks/github", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies, routes, and persists a pull request event", async () => {
    const app = await buildWebhookApp();
    const body = JSON.stringify(payload);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature(body),
        "x-github-delivery": "123e4567-e89b-12d3-a456-426614174000",
        "x-github-event": "pull_request",
      },
      payload: body,
    });
    expect(response.statusCode).toBe(202);
    expect(syncGitHubRepository).toHaveBeenCalledOnce();
    expect(syncGitHubPullRequest).toHaveBeenCalledWith(
      {},
      organizationId,
      9876n,
      expect.objectContaining({ number: 7, isFork: false, headSha: "a".repeat(40) }),
    );
    expect(finishProviderWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId, status: "processed" }),
    );
    await app.close();
  });

  it("rejects a bad signature before claiming the delivery", async () => {
    const app = await buildWebhookApp();
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
        "x-github-delivery": "123e4567-e89b-12d3-a456-426614174001",
        "x-github-event": "pull_request",
      },
      payload,
    });
    expect(response.statusCode).toBe(401);
    expect(claimWebhookDelivery).not.toHaveBeenCalled();
    await app.close();
  });
});
