import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./index";

describe("healthResponseSchema", () => {
  it("accepts a valid service health response", () => {
    const value = healthResponseSchema.parse({
      service: "control-plane",
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    });
    expect(value.status).toBe("ok");
  });
});
