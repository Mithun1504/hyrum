import { describe, expect, it } from "vitest";
import { ObjectStorage } from "./index";

const organizationId = "018f1735-7ad7-7f42-a234-5f15c31b20c2";

describe("object storage tenant boundary", () => {
  const storage = new ObjectStorage({ region: "auto", bucket: "test" });

  it("creates opaque tenant-prefixed keys", () => {
    const key = storage.objectKey(organizationId, "api-spec");
    expect(key).toMatch(new RegExp(`^${organizationId}/api-spec/[0-9a-f-]+$`));
    expect(key).not.toContain("openapi.json");
  });

  it("rejects cross-tenant and user-derived paths", () => {
    expect(() => storage.assertTenantKey(organizationId, "other/api-spec/object")).toThrow();
    expect(() => storage.objectKey(organizationId, "../../secrets")).toThrow();
  });
});
