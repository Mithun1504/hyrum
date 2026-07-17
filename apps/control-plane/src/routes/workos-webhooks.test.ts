import sensible from "@fastify/sensible";
import { claimWebhookDelivery, finishWebhookDelivery, syncWorkosMembership } from "@hyrum/db";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workosWebhookRoutes } from "./workos-webhooks";

vi.mock("@hyrum/db", () => ({
  claimWebhookDelivery: vi.fn(),
  finishWebhookDelivery: vi.fn(),
  revokeWorkosMembership: vi.fn(),
  syncWorkosInvitationState: vi.fn(),
  syncWorkosMembership: vi.fn(),
}));

const event = {
  id: "event_01",
  event: "organization_membership.updated" as const,
  createdAt: "2026-07-15T12:00:00.000Z",
  context: undefined,
  data: {
    object: "organization_membership" as const,
    id: "membership_01",
    organizationId: "org_01",
    organizationName: "Example workspace",
    status: "inactive" as const,
    userId: "user_01",
    directoryManaged: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
    customAttributes: {},
    role: { slug: "engineer" },
  },
};

async function buildWebhookApp(options: { signatureValid?: boolean; duplicate?: boolean } = {}) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensible);
  await app.register(rawBody, { global: false, encoding: "utf8", runFirst: true });
  app.decorate("database", { db: {}, sql: {}, close: vi.fn() } as never);
  app.decorate("workos", {
    webhooks: {
      constructEvent: vi.fn(async () => {
        if (options.signatureValid === false) throw new Error("invalid signature");
        return event;
      }),
    },
    userManagement: {
      getOrganizationMembership: vi.fn(async () => event.data),
      getUser: vi.fn(async () => ({
        id: "user_01",
        email: "engineer@example.test",
        name: "Example Engineer",
        profilePictureUrl: null,
      })),
    },
  } as never);
  vi.mocked(claimWebhookDelivery).mockResolvedValue(!(options.duplicate ?? false));
  vi.mocked(syncWorkosMembership).mockResolvedValue({
    organizationId: "019f6307-59e3-73ea-95ee-772dc5397444",
    userId: "019f6307-7dc5-7f85-9414-fd6887ed4407",
    membershipId: "019f6307-a4aa-7a72-b1cb-e6e122de3cb8",
    role: "engineer",
    lastAuthenticatedAt: null,
  });
  await app.register(workosWebhookRoutes, { webhookSecret: "whsec_test" });
  return app;
}

describe("POST /webhooks/workos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies, deduplicates, and reconciles membership state without advancing auth freshness", async () => {
    const app = await buildWebhookApp();
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/workos",
      headers: { "workos-signature": "v1,test" },
      payload: { event: "fixture" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ received: true, duplicate: false });
    expect(syncWorkosMembership).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workosOrganizationId: "org_01",
        status: "suspended",
        lastAuthenticatedAt: new Date(0),
      }),
    );
    expect(finishWebhookDelivery).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ status: "processed", workosOrganizationId: "org_01" }),
    );
    await app.close();
  });

  it("returns a duplicate acknowledgement without provider reconciliation", async () => {
    const app = await buildWebhookApp({ duplicate: true });
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/workos",
      headers: { "workos-signature": "v1,test" },
      payload: { event: "fixture" },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ received: true, duplicate: true });
    expect(syncWorkosMembership).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects an invalid signature before registering a delivery", async () => {
    const app = await buildWebhookApp({ signatureValid: false });
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/workos",
      headers: { "workos-signature": "invalid" },
      payload: { event: "fixture" },
    });
    expect(response.statusCode).toBe(401);
    expect(claimWebhookDelivery).not.toHaveBeenCalled();
    await app.close();
  });
});
