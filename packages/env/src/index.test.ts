import { describe, expect, it } from "vitest";
import { parseRuntimeEnv } from "./index";

describe("parseRuntimeEnv", () => {
  it("applies safe local defaults", () => {
    const env = parseRuntimeEnv({ DATABASE_URL: "postgresql://localhost/hyrum" });
    expect(env.CONTROL_PLANE_PORT).toBe(4000);
    expect(env.DATABASE_SSL).toBe(false);
    expect(env.OBJECT_STORAGE_ENDPOINT).toBe("http://127.0.0.1:9000");
    expect(env.OBJECT_STORAGE_BUCKET).toBe("hyrum-development");
  });

  it("rejects a missing database URL", () => {
    expect(() => parseRuntimeEnv({})).toThrow("Invalid environment configuration");
  });

  it("rejects local object storage defaults in production", () => {
    expect(() =>
      parseRuntimeEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/hyrum",
        DATABASE_SSL: "true",
      }),
    ).toThrow("OBJECT_STORAGE_ENDPOINT must use https in production");
  });

  it("requires a KMS key when KMS encryption is selected", () => {
    expect(() =>
      parseRuntimeEnv({
        DATABASE_URL: "postgresql://localhost/hyrum",
        OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: "aws:kms",
      }),
    ).toThrow("OBJECT_STORAGE_KMS_KEY_ID is required");
  });

  it("requires verified database TLS in production", () => {
    expect(() =>
      parseRuntimeEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://db.example.test/hyrum",
        DATABASE_SSL: "false",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
        OBJECT_STORAGE_BUCKET: "hyrum-production",
        OBJECT_STORAGE_ACCESS_KEY_ID: "production-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "production-secret",
      }),
    ).toThrow("DATABASE_SSL must be true in production");
  });

  it("treats an empty trusted-proxy list as disabled", () => {
    expect(
      parseRuntimeEnv({
        DATABASE_URL: "postgresql://localhost/hyrum",
        CONTROL_PLANE_TRUST_PROXY_CIDRS: "",
      }).CONTROL_PLANE_TRUST_PROXY_CIDRS,
    ).toBeUndefined();
  });

  it("treats documented empty optional values as unset", () => {
    const env = parseRuntimeEnv({
      DATABASE_URL: "postgresql://localhost/hyrum",
      WORKER_DATABASE_URL: "",
      OBJECT_STORAGE_KMS_KEY_ID: "",
    });

    expect(env.WORKER_DATABASE_URL).toBeUndefined();
    expect(env.OBJECT_STORAGE_KMS_KEY_ID).toBeUndefined();
  });
});
