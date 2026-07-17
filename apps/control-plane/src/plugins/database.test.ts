import type { RuntimeEnv } from "@hyrum/env";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { databasePlugin } from "./database";

const { assertSafeDatabasePrincipal, close } = vi.hoisted(() => ({
  assertSafeDatabasePrincipal: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@hyrum/db", () => ({
  assertSafeDatabasePrincipal,
  createDatabaseClient: vi.fn(() => ({ db: {}, sql: vi.fn(), close })),
}));

const env = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:secret@db/hyrum",
  DATABASE_POOL_MAX: 2,
  DATABASE_SSL: true,
} as RuntimeEnv;

beforeEach(() => {
  assertSafeDatabasePrincipal.mockReset();
  close.mockReset();
});

describe("databasePlugin", () => {
  it("verifies the principal before production startup", async () => {
    const app = Fastify({ logger: false });
    await app.register(databasePlugin, { env });

    expect(assertSafeDatabasePrincipal).toHaveBeenCalledWith(expect.any(Function), true);
    await app.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the client when principal verification fails", async () => {
    assertSafeDatabasePrincipal.mockRejectedValue(new Error("unsafe database principal"));
    const app = Fastify({ logger: false });

    await expect(app.register(databasePlugin, { env })).rejects.toThrow(
      /unsafe database principal/,
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
