import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

const env = {
  NODE_ENV: "test" as const,
  LOG_LEVEL: "silent" as const,
  CONTROL_PLANE_HOST: "127.0.0.1",
  CONTROL_PLANE_PORT: 4000,
  INTERNAL_OPERATIONS_ENABLED: false,
  WEB_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://localhost/hyrum_test",
  DATABASE_SSL: false,
  DATABASE_POOL_MAX: 1,
  S3_REGION: "auto",
  S3_BUCKET: "hyrum-test",
  S3_FORCE_PATH_STYLE: true,
  WORKOS_API_KEY: "sk_test_invalid_signature_only",
  WORKOS_WEBHOOK_SECRET: "whsec_test_secret",
  OPENAI_DEFAULT_MODEL: "gpt-5.6-terra",
  OPENAI_HIGH_VALUE_MODEL: "gpt-5.6",
  GITHUB_ACTIONS_OIDC_AUDIENCE: "hyrum-control-plane",
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

  it("rejects WorkOS webhook payloads before processing when the signature is invalid", async () => {
    const app = await buildApp({ env, includeDatabase: false });
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/workos",
      headers: {
        "content-type": "application/json",
        "workos-signature": "t=1, v1=invalid",
      },
      payload: { id: "event_untrusted" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      status: 401,
      detail: "Invalid WorkOS webhook signature",
    });
    await app.close();
  });
});
