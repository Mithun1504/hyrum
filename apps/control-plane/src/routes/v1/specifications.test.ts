import sensible from "@fastify/sensible";
import { findApiSpecificationByDigest, getApiService, persistApiSpecification } from "@hyrum/db";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { specificationRoutes } from "./specifications";

vi.mock("@hyrum/db", () => ({
  findApiSpecificationByDigest: vi.fn(),
  getApiService: vi.fn(),
  persistApiSpecification: vi.fn(),
}));

const organizationId = "019f6274-1529-71f2-bb0e-8e643b3ec843";
const serviceId = "019f6274-8db5-7313-b96e-9d721f04f3d7";
const membershipId = "019f6274-b573-71a0-b6ad-218a45f825dc";
const actorId = "019f6275-15d3-7008-8623-8f203b29daf5";
const service = {
  id: serviceId,
  name: "Payments API",
  slug: "payments-api",
  description: null,
  status: "onboarding" as const,
  ownerMembershipId: membershipId,
  firstCaptureAt: null,
  firstUsefulLedgerAt: null,
  createdAt: new Date(),
  defaultEnvironment: {
    id: "019f6274-d611-7351-bd13-7d8324930df3",
    name: "Production",
    slug: "production",
    kind: "production" as const,
    baseUrlOrigin: null,
    captureEnabled: false,
    isDefault: true,
  },
};

async function buildSpecificationApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensible);
  app.decorate("database", { db: {}, sql: {}, close: vi.fn() } as never);
  app.decorate("objectStorage", {
    put: vi.fn(async ({ body, contentType }) => ({
      bucket: "test",
      objectKey: `${organizationId}/api-spec/object`,
      byteSize: body.byteLength,
      sha256Digest: "stored-digest",
      contentType,
      contentEncoding: null,
    })),
    verify: vi.fn(),
    delete: vi.fn(),
  } as never);
  app.decorate("requirePermission", () => async (request) => {
    request.authContext = {
      requestId: request.id,
      organizationId,
      actor: {
        actorId,
        principalType: "human",
        membershipId,
        role: "engineer",
        permissions: ["spec:manage"],
        recentlyAuthenticated: true,
      },
    };
  });
  await app.register(specificationRoutes, { prefix: "/v1" });
  return app;
}

describe("POST /v1/services/:identifier/specifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates, stores, and activates an OpenAPI document", async () => {
    vi.mocked(getApiService).mockResolvedValue(service);
    vi.mocked(findApiSpecificationByDigest).mockResolvedValue(null);
    vi.mocked(persistApiSpecification).mockImplementation(
      async (_db, _organizationId, apiServiceId, _actor, input, original) => ({
        created: true,
        retainedObjectKeys: [original.objectKey],
        specification: {
          id: "019f62a0-7ec6-7fd7-986d-d6aa502e88c4",
          apiServiceId,
          versionLabel: input.versionLabel,
          source: "upload",
          originalDigest: input.originalDigest,
          normalizedDigest: input.normalizedDigest,
          openapiVersion: input.openapiVersion,
          validationStatus: "valid",
          validationErrors: [],
          isCurrent: true,
          supersedesSpecId: null,
          createdAt: new Date("2026-07-15T12:00:00.000Z"),
          operations: input.operations.map((operation) => ({
            id: "019f62a0-88bd-77f0-8074-6ab71cf0e920",
            ...operation,
          })),
        },
      }),
    );
    const app = await buildSpecificationApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/services/payments-api/specifications",
      payload: {
        versionLabel: "v1",
        document: JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Payments", version: "1" },
          paths: {
            "/payments/{id}": {
              get: {
                operationId: "getPayment",
                responses: { "200": { description: "ok" } },
              },
            },
          },
        }),
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      created: true,
      specification: { apiServiceId: serviceId, validationStatus: "valid" },
    });
    expect(persistApiSpecification).toHaveBeenCalledOnce();
    await app.close();
  });

  it("rejects an invalid document before object storage", async () => {
    vi.mocked(getApiService).mockResolvedValue(service);
    const app = await buildSpecificationApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/services/payments-api/specifications",
      payload: { versionLabel: "bad", document: "not: openapi" },
    });
    expect(response.statusCode).toBe(422);
    expect(persistApiSpecification).not.toHaveBeenCalled();
    await app.close();
  });
});
