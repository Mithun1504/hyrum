import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

const env = {
  NODE_ENV: "test" as const,
  LOG_LEVEL: "silent" as const,
  CONTROL_PLANE_HOST: "127.0.0.1",
  CONTROL_PLANE_PORT: 4000,
  WEB_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://localhost/hyrum_test",
  DATABASE_SSL: false,
  DATABASE_POOL_MAX: 1,
};

describe("control plane", () => {
  it("returns a typed liveness response", async () => {
    const app = await buildApp({ env, includeDatabase: false });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: "control-plane", status: "ok" });
    await app.close();
  });

  it("uses problem details for unknown routes", async () => {
    const app = await buildApp({ env, includeDatabase: false });
    const response = await app.inject({ method: "GET", url: "/missing" });
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({ status: 404, title: "Not Found" });
    await app.close();
  });
});
