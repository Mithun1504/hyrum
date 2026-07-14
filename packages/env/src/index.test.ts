import { describe, expect, it } from "vitest";
import { parseRuntimeEnv } from "./index";

describe("parseRuntimeEnv", () => {
  it("applies safe local defaults", () => {
    const env = parseRuntimeEnv({ DATABASE_URL: "postgresql://localhost/hyrum" });
    expect(env.CONTROL_PLANE_PORT).toBe(4000);
    expect(env.DATABASE_SSL).toBe(false);
  });

  it("rejects a missing database URL", () => {
    expect(() => parseRuntimeEnv({})).toThrow("Invalid environment configuration");
  });
});
