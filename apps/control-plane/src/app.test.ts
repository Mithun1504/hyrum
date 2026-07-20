import sensible from "@fastify/sensible";
import { memberships, organizations, users } from "@hyrum/db";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";
import { authPlugin } from "./plugins/auth";

const jwtVerifyMock = vi.hoisted(() => vi.fn());
const createRemoteJWKSetMock = vi.hoisted(() => vi.fn(() => "jwks"));

vi.mock("jose", () => ({
  createRemoteJWKSet: createRemoteJWKSetMock,
  jwtVerify: jwtVerifyMock,
}));

const env = {
  NODE_ENV: "test" as const,
  LOG_LEVEL: "silent" as const,
  CONTROL_PLANE_HOST: "127.0.0.1",
  CONTROL_PLANE_PORT: 4000,
  WEB_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://localhost/hyrum_test",
  DATABASE_SSL: false,
  DATABASE_POOL_MAX: 1,
  OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  OBJECT_STORAGE_REGION: "us-east-1",
  OBJECT_STORAGE_BUCKET: "hyrum-development",
  OBJECT_STORAGE_ACCESS_KEY_ID: "minioadmin",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "minioadmin",
  OBJECT_STORAGE_FORCE_PATH_STYLE: true,
  OBJECT_STORAGE_MAX_OBJECT_BYTES: 25 * 1024 * 1024,
  OBJECT_STORAGE_PRESIGN_MAX_SECONDS: 300,
  OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: "bucket" as const,
};

describe("control plane", () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
    createRemoteJWKSetMock.mockClear();
    createRemoteJWKSetMock.mockReturnValue("jwks");
  });

  it("returns a typed liveness response", async () => {
    const app = await buildApp({ env, includeDatabase: false });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: "control-plane", status: "ok" });
    expect(app.swagger()).toMatchObject({ openapi: "3.1.0" });
    await app.close();
  });

  it("uses problem details for unknown routes", async () => {
    const app = await buildApp({ env, includeDatabase: false });
    const response = await app.inject({ method: "GET", url: "/missing" });
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({ status: 404, title: "Not Found" });
    await app.close();
  });

  it("uses problem details for protected route errors", async () => {
    const app = await buildApp({ env, includeDatabase: false });
    const response = await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { authorization: "Bearer invalid" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({
      status: 503,
      title: "ServiceUnavailableError",
      code: "request_failed",
    });
    await app.close();
  });

  it("accepts WorkOS session tokens without an audience claim", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        iss: "https://api.workos.com/",
        sub: "user_123",
        org_id: "org_123",
        client_id: "client_123",
      },
    });

    const app = await buildAuthTestApp("https://api.workos.com");
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(
      new URL("https://api.workos.com/sso/jwks/client_123"),
    );
    expect(jwtVerifyMock).toHaveBeenCalledWith("session-token", "jwks", {
      issuer: ["https://api.workos.com/", "https://api.workos.com"],
    });
    expect(response.json()).toMatchObject({
      actorId: "user-id",
      organizationId: "organization-id",
      role: "admin",
    });
    await app.close();
  });

  it("fails closed when an existing local membership is not active in WorkOS", async () => {
    mockValidWorkosToken();
    const workos = fakeWorkos([]);
    const app = await buildAuthTestApp(undefined, fakeDatabase(), workos);

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(workos.userManagement.listOrganizationMemberships).toHaveBeenCalledOnce();
    await app.close();
  });

  it("fails closed when WorkOS membership verification fails", async () => {
    mockValidWorkosToken();
    const workos = fakeWorkos();
    workos.userManagement.listOrganizationMemberships.mockRejectedValueOnce(
      new Error("WorkOS unavailable"),
    );
    const app = await buildAuthTestApp(undefined, fakeDatabase(), workos);

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("deduplicates concurrent WorkOS membership checks and caches the result", async () => {
    mockValidWorkosToken();
    const workos = fakeWorkos();
    const app = await buildAuthTestApp(undefined, fakeDatabase(), workos);
    const request = () =>
      app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: "Bearer session-token" },
      });

    const responses = await Promise.all([request(), request(), request()]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(workos.userManagement.listOrganizationMemberships).toHaveBeenCalledOnce();

    expect((await request()).statusCode).toBe(200);
    expect(workos.userManagement.listOrganizationMemberships).toHaveBeenCalledOnce();
    await app.close();
  });

  it("rechecks WorkOS membership after the freshness window", async () => {
    mockValidWorkosToken();
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    const workos = fakeWorkos();
    const app = await buildAuthTestApp(undefined, fakeDatabase(), workos);
    const request = () =>
      app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: "Bearer session-token" },
      });

    expect((await request()).statusCode).toBe(200);
    now += 45_001;
    expect((await request()).statusCode).toBe(200);
    expect(workos.userManagement.listOrganizationMemberships).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
    await app.close();
  });

  it("rejects WorkOS session tokens for another client", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        iss: "https://api.workos.com/",
        sub: "user_123",
        org_id: "org_123",
        client_id: "client_other",
      },
    });

    const app = await buildAuthTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("provisions a fresh active WorkOS membership without local seeding", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        iss: "https://api.workos.com/",
        sub: "user_123",
        org_id: "org_123",
        client_id: "client_123",
      },
    });
    const database = fakeDatabase(null);
    const workos = fakeWorkos();
    const app = await buildAuthTestApp(undefined, database, workos);

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      actorId: "user-id",
      organizationId: "organization-id",
      role: "engineer",
    });
    expect(workos.userManagement.getUser).toHaveBeenCalledWith("user_123");
    expect(workos.organizations.getOrganization).toHaveBeenCalledWith("org_123");
    expect(workos.userManagement.listOrganizationMemberships).toHaveBeenCalledWith({
      organizationId: "org_123",
      userId: "user_123",
      statuses: ["active"],
      limit: 1,
    });
    expect(database.state).toMatchObject({
      membership: {
        actorId: "user-id",
        organizationId: "organization-id",
        role: "engineer",
      },
      organization: { workosOrganizationId: "org_123", name: "Acme" },
      user: {
        workosUserId: "user_123",
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      },
    });
    await app.close();
  });

  it("keeps an unrecognized WorkOS role read-only", async () => {
    mockValidWorkosToken();
    const database = fakeDatabase(null);
    const workos = fakeWorkos([
      {
        organizationId: "org_123",
        userId: "user_123",
        status: "active",
        role: { slug: "billing" },
      },
    ]);
    const app = await buildAuthTestApp(undefined, database, workos);

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ role: "viewer" });
    await app.close();
  });

  it("does not provision a user without an active WorkOS organization membership", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        iss: "https://api.workos.com/",
        sub: "user_123",
        org_id: "org_123",
        client_id: "client_123",
      },
    });
    const database = fakeDatabase(null);
    const workos = fakeWorkos([]);
    const app = await buildAuthTestApp(undefined, database, workos);

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(database.state.membership).toBeNull();
    await app.close();
  });
});

async function buildAuthTestApp(
  issuer?: string,
  database = fakeDatabase(),
  workos: ReturnType<typeof fakeWorkos> | undefined = fakeWorkos(),
) {
  const app = Fastify({ logger: false });
  await app.register(sensible);
  app.decorate("database", database as never);
  await app.register(authPlugin, {
    clientId: "client_123",
    jwksUrl: undefined,
    issuer,
    workos: workos as never,
  });
  app.get("/protected", { preHandler: app.authenticateHuman }, async (request) => {
    return request.authContext;
  });
  return app;
}

function mockValidWorkosToken() {
  jwtVerifyMock.mockResolvedValue({
    payload: {
      iss: "https://api.workos.com/",
      sub: "user_123",
      org_id: "org_123",
      client_id: "client_123",
    },
  });
}

type FakeMembership = {
  actorId: string;
  organizationId: string;
  role: "owner" | "admin" | "engineer" | "viewer";
};

const existingMembership: FakeMembership = {
  actorId: "user-id",
  organizationId: "organization-id",
  role: "admin",
};

function fakeDatabase(initialMembership: FakeMembership | null = existingMembership) {
  const state: {
    membership: FakeMembership | null;
    organization?: Record<string, unknown>;
    user?: Record<string, unknown>;
  } = { membership: initialMembership };
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    limit: () => (state.membership ? [state.membership] : []),
  };
  const tx = {
    execute: vi.fn(),
    select: vi.fn(() => query),
    insert: vi.fn((table) => fakeInsert(table, state)),
  };
  return {
    state,
    db: {
      transaction: vi.fn(async (fn) => fn(tx)),
    },
    sql: vi.fn(),
    close: vi.fn(),
  };
}

function fakeInsert(table: unknown, state: ReturnType<typeof fakeDatabase>["state"]) {
  let values: Record<string, unknown> = {};
  const builder = {
    values(nextValues: Record<string, unknown>) {
      values = nextValues;
      return builder;
    },
    onConflictDoUpdate() {
      return builder;
    },
    onConflictDoNothing() {
      return builder;
    },
    returning() {
      if (table === organizations) {
        state.organization = values;
        return [{ id: "organization-id", active: true }];
      }
      if (table === users) {
        state.user = values;
        return [{ id: "user-id" }];
      }
      if (table === memberships) {
        if (state.membership) return [];
        state.membership = {
          actorId: String(values.userId),
          organizationId: String(values.organizationId),
          role: values.role as FakeMembership["role"],
        };
        return [state.membership];
      }
      return [];
    },
  };
  return builder;
}

function fakeWorkos(
  organizationMemberships = [
    {
      organizationId: "org_123",
      userId: "user_123",
      status: "active" as const,
      role: { slug: "member" },
    },
  ],
) {
  return {
    organizations: {
      getOrganization: vi.fn(async () => ({ id: "org_123", name: "Acme" })),
    },
    userManagement: {
      getUser: vi.fn(async () => ({
        id: "user_123",
        email: "ada@example.com",
        name: null,
        firstName: "Ada",
        lastName: "Lovelace",
      })),
      listOrganizationMemberships: vi.fn(async () => ({ data: organizationMemberships })),
    },
  };
}
