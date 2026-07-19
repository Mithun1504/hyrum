import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import {
  createObjectStorage,
  type ObjectStorageConfig,
  ObjectStorageError,
  objectKey,
} from "./index";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const body = Buffer.from("redacted receipt");
const sha256 = "26c209223af560b7894a9c9ceb4488e078228f80506632208f0321603cefb6e0";

function config(overrides: Partial<ObjectStorageConfig> = {}): ObjectStorageConfig {
  return {
    endpoint: "http://127.0.0.1:9000",
    region: "us-east-1",
    bucket: "hyrum-development",
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
    forcePathStyle: true,
    maxObjectBytes: 1024,
    presignMaxSeconds: 300,
    serverSideEncryption: "bucket",
    ...overrides,
  };
}

function responseBody(bytes: Uint8Array) {
  return { transformToByteArray: async () => bytes };
}

describe("S3 object storage", () => {
  it("stores content-addressed tenant-prefixed keys without caller path input", async () => {
    const sent: unknown[] = [];
    const storage = createObjectStorage(config(), {
      client: { send: vi.fn(async (command) => sent.push(command)) },
    });

    const result = await storage.putObject({
      organizationId: orgA,
      kind: "receipt",
      body,
      contentType: "application/json",
    });

    expect(result).toEqual({
      organizationId: orgA,
      kind: "receipt",
      key: `organizations/${orgA}/receipt/sha256/${sha256}`,
      sha256,
      sizeBytes: body.byteLength,
    });
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect((sent[0] as PutObjectCommand).input).toMatchObject({
      Bucket: "hyrum-development",
      Key: result.key,
      Metadata: { sha256, kind: "receipt" },
    });
  });

  it("rejects foreign-tenant and path-shaped keys", async () => {
    const storage = createObjectStorage(config(), {
      client: { send: vi.fn() },
    });
    const otherTenantKey = objectKey({
      organizationId: orgB,
      kind: "receipt",
      sha256,
    });

    await expect(
      storage.headObject({ organizationId: orgA, key: otherTenantKey }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      storage.deleteObject({ organizationId: orgA, key: "../secret" }),
    ).rejects.toThrow();
  });

  it("verifies upload and download SHA-256 digests", async () => {
    const storage = createObjectStorage(config(), {
      client: {
        send: vi.fn(async (command) => {
          if (command instanceof GetObjectCommand) {
            return {
              Body: responseBody(Buffer.from("tampered")),
              ContentType: "application/json",
            };
          }
          return {};
        }),
      },
    });
    const key = objectKey({ organizationId: orgA, kind: "receipt", sha256 });

    await expect(
      storage.putObject({
        organizationId: orgA,
        kind: "receipt",
        body,
        contentType: "application/json",
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    await expect(storage.getObject({ organizationId: orgA, key })).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    });
  });

  it("returns null for missing objects", async () => {
    const storage = createObjectStorage(config(), {
      client: {
        send: vi.fn(async () => {
          throw Object.assign(new Error("missing"), {
            name: "NoSuchKey",
            $metadata: { httpStatusCode: 404 },
          });
        }),
      },
    });
    const key = objectKey({ organizationId: orgA, kind: "receipt", sha256 });

    await expect(storage.getObject({ organizationId: orgA, key })).resolves.toBeNull();
    await expect(storage.headObject({ organizationId: orgA, key })).resolves.toBeNull();
  });

  it("bounds read-only presigned URLs", async () => {
    const presign = vi.fn(async (_client, command, options) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(options).toEqual({ expiresIn: 120 });
      return "https://signed.example/object";
    });
    const storage = createObjectStorage(config({ presignMaxSeconds: 120 }), {
      client: { send: vi.fn() },
      presign,
    });
    const key = objectKey({ organizationId: orgA, kind: "corpus", sha256 });

    await expect(
      storage.presignRead({ organizationId: orgA, key, expiresInSeconds: 121 }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      storage.presignRead({ organizationId: orgA, key, expiresInSeconds: 120 }),
    ).resolves.toBe("https://signed.example/object");
    expect(presign).toHaveBeenCalledOnce();
  });

  it("creates bounded tenant-scoped content-addressed upload URLs", async () => {
    const presign = vi.fn(async (_client, command, options) => {
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(options).toEqual({ expiresIn: 120 });
      return "https://signed.example/upload";
    });
    const storage = createObjectStorage(config({ presignMaxSeconds: 120 }), {
      client: { send: vi.fn() },
      presign,
    });

    await expect(
      storage.presignWrite({
        organizationId: orgA,
        kind: "corpus",
        sha256,
        sizeBytes: body.byteLength,
        contentType: "application/x-ndjson",
        expiresInSeconds: 120,
      }),
    ).resolves.toEqual({
      key: `organizations/${orgA}/corpus/sha256/${sha256}`,
      url: "https://signed.example/upload",
      headers: {
        "content-type": "application/x-ndjson",
        "x-amz-meta-sha256": sha256,
        "x-amz-meta-kind": "corpus",
      },
    });
  });

  it("sends configured per-object encryption only when selected", async () => {
    const commands: unknown[] = [];
    const storage = createObjectStorage(config({ serverSideEncryption: "AES256" }), {
      client: { send: vi.fn(async (command) => commands.push(command)) },
    });

    await storage.putObject({
      organizationId: orgA,
      kind: "report",
      body,
      contentType: "application/json",
    });

    expect((commands[0] as PutObjectCommand).input.ServerSideEncryption).toBe("AES256");
  });

  it("enforces strict max body limits before SDK calls", async () => {
    const send = vi.fn();
    const storage = createObjectStorage(config({ maxObjectBytes: 2 }), {
      client: { send },
    });

    await expect(
      storage.putObject({
        organizationId: orgA,
        kind: "receipt",
        body,
        contentType: "application/json",
      }),
    ).rejects.toBeInstanceOf(ObjectStorageError);
    expect(send).not.toHaveBeenCalled();
  });

  it("issues head and delete SDK commands with tenant-validated keys", async () => {
    const commands: unknown[] = [];
    const key = objectKey({ organizationId: orgA, kind: "spec", sha256 });
    const storage = createObjectStorage(config(), {
      client: {
        send: vi.fn(async (command) => {
          commands.push(command);
          return command instanceof HeadObjectCommand
            ? { ContentLength: body.byteLength, Metadata: { sha256 } }
            : {};
        }),
      },
    });

    await expect(storage.headObject({ organizationId: orgA, key })).resolves.toMatchObject({
      organizationId: orgA,
      kind: "spec",
      sha256,
    });
    await storage.deleteObject({ organizationId: orgA, key });

    expect(commands[0]).toBeInstanceOf(HeadObjectCommand);
    expect(commands[1]).toBeInstanceOf(DeleteObjectCommand);
  });
});
