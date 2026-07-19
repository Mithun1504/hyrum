import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const storageKinds = ["receipt", "corpus", "spec", "report"] as const;
const organizationIdSchema = z.uuid();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const objectKeySchema = z
  .string()
  .regex(/^organizations\/[0-9a-f-]{36}\/(receipt|corpus|spec|report)\/sha256\/[a-f0-9]{64}$/);

export const objectStorageConfigSchema = z
  .object({
    endpoint: z.url(),
    region: z.string().min(1),
    bucket: z.string().min(3),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    forcePathStyle: z.boolean().default(true),
    maxObjectBytes: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    presignMaxSeconds: z.number().int().positive().max(900),
    serverSideEncryption: z.enum(["bucket", "AES256", "aws:kms"]).default("bucket"),
    kmsKeyId: z.string().min(1).optional(),
  })
  .strict()
  .refine((config) => config.serverSideEncryption !== "aws:kms" || config.kmsKeyId, {
    message: "kmsKeyId is required when serverSideEncryption is aws:kms",
    path: ["kmsKeyId"],
  });

export type ObjectStorageConfig = z.infer<typeof objectStorageConfigSchema>;
export type ObjectKind = (typeof storageKinds)[number];

export interface StoredObjectRef {
  organizationId: string;
  kind: ObjectKind;
  key: string;
  sha256: string;
  sizeBytes: number;
}

export interface ObjectStorageHead extends StoredObjectRef {
  contentType?: string;
  lastModified?: Date;
}

type StorageBody = string | Uint8Array;
interface S3LikeClient {
  send(command: unknown): Promise<unknown>;
}

export class ObjectStorageError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "BODY_TOO_LARGE"
      | "INTEGRITY_MISMATCH"
      | "NOT_FOUND"
      | "STORAGE_UNAVAILABLE",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ObjectStorageError";
  }
}

export class S3ObjectStorage {
  readonly #config: ObjectStorageConfig;
  readonly #client: S3LikeClient;
  readonly #presign: typeof getSignedUrl;

  constructor(
    config: ObjectStorageConfig,
    options: { client?: S3LikeClient; presign?: typeof getSignedUrl } = {},
  ) {
    this.#config = objectStorageConfigSchema.parse(config);
    this.#client =
      options.client ??
      new S3Client({
        endpoint: this.#config.endpoint,
        region: this.#config.region,
        forcePathStyle: this.#config.forcePathStyle,
        credentials: {
          accessKeyId: this.#config.accessKeyId,
          secretAccessKey: this.#config.secretAccessKey,
        },
      });
    this.#presign = options.presign ?? getSignedUrl;
  }

  async putObject(input: {
    organizationId: string;
    kind: ObjectKind;
    body: StorageBody;
    contentType: string;
    expectedSha256?: string;
  }): Promise<StoredObjectRef> {
    const organizationId = organizationIdSchema.parse(input.organizationId);
    const kind = z.enum(storageKinds).parse(input.kind);
    const body = toBuffer(input.body, this.#config.maxObjectBytes);
    const sha256 = digest(body);
    if (input.expectedSha256 && input.expectedSha256 !== sha256) {
      throw new ObjectStorageError(
        "Object body did not match expected SHA-256",
        "INTEGRITY_MISMATCH",
      );
    }
    const key = objectKey({ organizationId, kind, sha256 });
    await this.#send(
      new PutObjectCommand({
        Bucket: this.#config.bucket,
        Key: key,
        Body: body,
        ContentLength: body.byteLength,
        ContentType: z.string().min(1).parse(input.contentType),
        Metadata: { sha256, kind },
        ...this.#encryptionInput(),
      }),
    );
    return { organizationId, kind, key, sha256, sizeBytes: body.byteLength };
  }

  async getObject(input: {
    organizationId: string;
    key: string;
    expectedSha256?: string;
  }): Promise<(StoredObjectRef & { body: Buffer; contentType?: string }) | null> {
    const keyParts = parseObjectKeyForTenant(input.key, input.organizationId);
    try {
      const output = await this.#send<GetObjectCommandOutput>(
        new GetObjectCommand({
          Bucket: this.#config.bucket,
          Key: keyParts.key,
        }),
      );
      if (Number(output.ContentLength ?? 0) > this.#config.maxObjectBytes) {
        throw new ObjectStorageError(
          "Object body exceeds the configured size limit",
          "BODY_TOO_LARGE",
        );
      }
      const body = await bodyToBuffer(output.Body, this.#config.maxObjectBytes);
      const sha256 = digest(body);
      const expectedSha256 = input.expectedSha256 ?? keyParts.sha256;
      if (sha256 !== expectedSha256 || sha256 !== keyParts.sha256) {
        throw new ObjectStorageError(
          "Stored object failed SHA-256 verification",
          "INTEGRITY_MISMATCH",
        );
      }
      return {
        ...keyParts,
        body,
        sizeBytes: body.byteLength,
        ...(output.ContentType ? { contentType: output.ContentType } : {}),
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw mapStorageError(error);
    }
  }

  async headObject(input: {
    organizationId: string;
    key: string;
  }): Promise<ObjectStorageHead | null> {
    const keyParts = parseObjectKeyForTenant(input.key, input.organizationId);
    try {
      const output = await this.#send<HeadObjectCommandOutput>(
        new HeadObjectCommand({
          Bucket: this.#config.bucket,
          Key: keyParts.key,
        }),
      );
      const metadataSha256 = output.Metadata?.sha256;
      if (metadataSha256 && metadataSha256 !== keyParts.sha256) {
        throw new ObjectStorageError(
          "Object metadata failed SHA-256 verification",
          "INTEGRITY_MISMATCH",
        );
      }
      return {
        ...keyParts,
        sizeBytes: Number(output.ContentLength ?? 0),
        ...(output.ContentType ? { contentType: output.ContentType } : {}),
        ...(output.LastModified ? { lastModified: output.LastModified } : {}),
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw mapStorageError(error);
    }
  }

  async deleteObject(input: { organizationId: string; key: string }): Promise<void> {
    const keyParts = parseObjectKeyForTenant(input.key, input.organizationId);
    await this.#send(
      new DeleteObjectCommand({
        Bucket: this.#config.bucket,
        Key: keyParts.key,
      }),
    );
  }

  async presignRead(input: {
    organizationId: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const keyParts = parseObjectKeyForTenant(input.key, input.organizationId);
    if (input.expiresInSeconds < 1 || input.expiresInSeconds > this.#config.presignMaxSeconds) {
      throw new ObjectStorageError(
        "Presigned URL expiry is outside the allowed bounds",
        "INVALID_INPUT",
      );
    }
    return this.#presign(
      this.#client as S3Client,
      new GetObjectCommand({ Bucket: this.#config.bucket, Key: keyParts.key }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async presignWrite(input: {
    organizationId: string;
    kind: ObjectKind;
    sha256: string;
    sizeBytes: number;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ key: string; url: string; headers: Record<string, string> }> {
    const organizationId = organizationIdSchema.parse(input.organizationId);
    const kind = z.enum(storageKinds).parse(input.kind);
    const sha256 = sha256Schema.parse(input.sha256);
    const sizeBytes = z
      .number()
      .int()
      .positive()
      .max(this.#config.maxObjectBytes)
      .parse(input.sizeBytes);
    const contentType = z.string().min(1).max(200).parse(input.contentType);
    if (input.expiresInSeconds < 1 || input.expiresInSeconds > this.#config.presignMaxSeconds) {
      throw new ObjectStorageError(
        "Presigned URL expiry is outside the allowed bounds",
        "INVALID_INPUT",
      );
    }
    const key = objectKey({ organizationId, kind, sha256 });
    const metadata = { sha256, kind };
    const url = await this.#presign(
      this.#client as S3Client,
      new PutObjectCommand({
        Bucket: this.#config.bucket,
        Key: key,
        ContentLength: sizeBytes,
        ContentType: contentType,
        Metadata: metadata,
        ...this.#encryptionInput(),
      }),
      { expiresIn: input.expiresInSeconds },
    );
    return {
      key,
      url,
      headers: {
        "content-type": contentType,
        "x-amz-meta-sha256": sha256,
        "x-amz-meta-kind": kind,
      },
    };
  }

  #encryptionInput(): {
    ServerSideEncryption?: ServerSideEncryption;
    SSEKMSKeyId?: string;
  } {
    if (this.#config.serverSideEncryption === "bucket") return {};
    if (this.#config.serverSideEncryption === "AES256") return { ServerSideEncryption: "AES256" };
    if (!this.#config.kmsKeyId) {
      throw new ObjectStorageError(
        "KMS key ID is required for object storage encryption",
        "INVALID_INPUT",
      );
    }
    return {
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: this.#config.kmsKeyId,
    };
  }

  async #send<T>(command: unknown): Promise<T> {
    try {
      return (await this.#client.send(command)) as T;
    } catch (error) {
      throw mapStorageError(error);
    }
  }
}

export function createObjectStorage(
  config: ObjectStorageConfig,
  options?: { client?: S3LikeClient; presign?: typeof getSignedUrl },
): S3ObjectStorage {
  return new S3ObjectStorage(config, options);
}

export function objectKey(input: {
  organizationId: string;
  kind: ObjectKind;
  sha256: string;
}): string {
  const organizationId = organizationIdSchema.parse(input.organizationId);
  const kind = z.enum(storageKinds).parse(input.kind);
  const sha256 = sha256Schema.parse(input.sha256);
  return `organizations/${organizationId}/${kind}/sha256/${sha256}`;
}

function parseObjectKeyForTenant(key: string, organizationId: string): StoredObjectRef {
  const parsedOrganizationId = organizationIdSchema.parse(organizationId);
  const parsedKey = objectKeySchema.parse(key);
  const parts = parsedKey.split("/");
  const keyOrganizationId = parts[1];
  const kind = parts[2] as ObjectKind;
  const sha256 = parts[4];
  if (keyOrganizationId !== parsedOrganizationId || !sha256) {
    throw new ObjectStorageError(
      "Object key does not belong to this organization",
      "INVALID_INPUT",
    );
  }
  return {
    organizationId: parsedOrganizationId,
    kind,
    key: parsedKey,
    sha256,
    sizeBytes: 0,
  };
}

function toBuffer(body: StorageBody, maxBytes: number): Buffer {
  const buffer = typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
  if (buffer.byteLength > maxBytes) {
    throw new ObjectStorageError("Object body exceeds the configured size limit", "BODY_TOO_LARGE");
  }
  return buffer;
}

async function bodyToBuffer(body: unknown, maxBytes: number): Promise<Buffer> {
  if (!body || typeof body !== "object" || !("transformToByteArray" in body)) {
    throw new ObjectStorageError("S3 response body is unreadable", "STORAGE_UNAVAILABLE");
  }
  const bytes = Buffer.from(
    await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray(),
  );
  if (bytes.byteLength > maxBytes) {
    throw new ObjectStorageError("Object body exceeds the configured size limit", "BODY_TOO_LARGE");
  }
  return bytes;
}

function digest(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function isMissingObject(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
  const status =
    error && typeof error === "object" && "$metadata" in error
      ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
      : undefined;
  return (
    (error instanceof ObjectStorageError && error.code === "NOT_FOUND") ||
    name === "NoSuchKey" ||
    name === "NotFound" ||
    status === 404
  );
}

function mapStorageError(error: unknown): ObjectStorageError {
  if (error instanceof ObjectStorageError) return error;
  if (isMissingObject(error)) return new ObjectStorageError("Object was not found", "NOT_FOUND");
  return new ObjectStorageError("Object storage request failed", "STORAGE_UNAVAILABLE", {
    cause: error,
  });
}
