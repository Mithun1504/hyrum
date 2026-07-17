import sensible from "@fastify/sensible";
import { getApiService } from "@hyrum/db";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serviceRoutes } from "./services";

vi.mock("@hyrum/db", () => ({
  createApiService: vi.fn(),
  getApiService: vi.fn(),
  listApiServices: vi.fn(),
}));

const organizationId = "019f6274-1529-71f2-bb0e-8e643b3ec843";
const serviceRecord = {
  id: "019f6274-8db5-7313-b96e-9d721f04f3d7",
  name: "Payments API",
  slug: "payments-api",
  description: null,
  status: "active" as const,
  ownerMembershipId: "019f6274-b573-71a0-b6ad-218a45f825dc",
  firstCaptureAt: null,
  firstUsefulLedgerAt: null,
  createdAt: new Date("2026-07-15T08:00:00.000Z"),
  defaultEnvironment: {
    id: "019f6274-d611-7351-bd13-7d8324930df3",
    name: "Production",
    slug: "production",
    kind: "production" as const,
    baseUrlOrigin: "https://api.example.test",
    captureEnabled: true,
    isDefault: true,
  },
};

async function buildServiceApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensible);
  app.decorate("database", { db: {}, sql: {}, close: vi.fn() } as never);
  app.decorate("requirePermission", () => async (request) => {
    request.authContext = {
      requestId: request.id,
      organizationId,
      actor: {
        actorId: "019f6275-15d3-7008-8623-8f203b29daf5",
        principalType: "human",
        membershipId: "019f6274-b573-71a0-b6ad-218a45f825dc",
        role: "viewer",
        permissions: ["service:read"],
        recentlyAuthenticated: true,
      },
    };
  });
  await app.register(serviceRoutes, { prefix: "/v1" });
  return app;
}

describe("GET /v1/services/:identifier", () => {
  beforeEach(() => vi.mocked(getApiService).mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("returns the tenant-scoped service detail by slug", async () => {
    vi.mocked(getApiService).mockResolvedValue(serviceRecord);
    const app = await buildServiceApp();

    const response = await app.inject({ method: "GET", url: "/v1/services/payments-api" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: serviceRecord.id, slug: "payments-api" });
    expect(getApiService).toHaveBeenCalledWith({}, organizationId, "payments-api");
    await app.close();
  });

  it("returns 404 without exposing whether another tenant owns the identifier", async () => {
    vi.mocked(getApiService).mockResolvedValue(null);
    const app = await buildServiceApp();

    const response = await app.inject({ method: "GET", url: `/v1/services/${serviceRecord.id}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: "Service not found" });
    expect(getApiService).toHaveBeenCalledWith({}, organizationId, serviceRecord.id);
    await app.close();
  });

  it("rejects malformed identifiers before repository access", async () => {
    const app = await buildServiceApp();

    const response = await app.inject({ method: "GET", url: "/v1/services/INVALID" });

    expect(response.statusCode).toBe(400);
    expect(getApiService).not.toHaveBeenCalled();
    await app.close();
  });
});
