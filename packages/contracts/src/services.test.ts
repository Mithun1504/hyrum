import { describe, expect, it } from "vitest";
import { servicePathParamsSchema } from "./services";

describe("service path parameters", () => {
  it.each([
    "payments-api",
    "019f6274-8db5-7313-b96e-9d721f04f3d7",
  ])("accepts service identifier %s", (identifier) => {
    expect(servicePathParamsSchema.parse({ identifier })).toEqual({ identifier });
  });

  it.each(["Payments API", "a", "../payments"])("rejects invalid identifier %s", (identifier) => {
    expect(() => servicePathParamsSchema.parse({ identifier })).toThrow();
  });
});
