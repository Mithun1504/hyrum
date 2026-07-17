import { describe, expect, it } from "vitest";
import { ObjectStorage } from "./index";

const endpoint = process.env.S3_TEST_ENDPOINT;
const suite = endpoint ? describe : describe.skip;

suite("S3-compatible object storage integration", () => {
  const organizationId = "018f1735-7ad7-7f42-a234-5f15c31b20c2";
  const storage = new ObjectStorage({
    endpoint: endpoint as string,
    region: "auto",
    bucket: process.env.S3_TEST_BUCKET ?? "hyrum-development",
    accessKeyId: process.env.S3_TEST_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_TEST_SECRET_KEY ?? "minioadmin",
    forcePathStyle: true,
  });

  it("writes, verifies, reads, signs, and deletes within a tenant prefix", async () => {
    const body = new TextEncoder().encode('{"openapi":"3.1.0"}');
    const stored = await storage.put({
      organizationId,
      purpose: "api-spec",
      body,
      contentType: "application/json",
    });
    await expect(storage.verify(stored)).resolves.toBeUndefined();
    await expect(storage.read(organizationId, stored.objectKey, 1_024)).resolves.toEqual(body);
    await expect(storage.signedReadUrl(organizationId, stored.objectKey, 60)).resolves.toContain(
      stored.objectKey,
    );
    await expect(storage.delete(organizationId, stored.objectKey)).resolves.toBeUndefined();
  });
});
