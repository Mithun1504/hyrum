import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PURPOSES = new Set([
  "api-spec",
  "capture-batch",
  "receipt-bundle",
  "replay-corpus",
  "replay-report",
  "fixture-bundle",
  "generated-artifact",
  "evaluation-dataset",
  "deletion-manifest",
]);

export interface ObjectStorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  serverSideEncryption?: "AES256";
}

export interface StoredObjectBody {
  organizationId: string;
  purpose: string;
  body: Uint8Array;
  contentType: string;
  contentEncoding?: string;
}

export interface StoredObjectResult {
  bucket: string;
  objectKey: string;
  byteSize: number;
  sha256Digest: string;
  contentType: string;
  contentEncoding: string | null;
}

export class ObjectStorage {
  readonly bucket: string;
  private readonly client: S3Client;
  private readonly serverSideEncryption: "AES256" | undefined;

  constructor(config: ObjectStorageConfig) {
    this.bucket = config.bucket;
    this.serverSideEncryption = config.serverSideEncryption;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle !== undefined ? { forcePathStyle: config.forcePathStyle } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  objectKey(organizationId: string, purpose: string): string {
    if (!UUID_PATTERN.test(organizationId)) throw new TypeError("organizationId must be a UUID");
    if (!ALLOWED_PURPOSES.has(purpose)) throw new TypeError("Unsupported object purpose");
    return `${organizationId}/${purpose}/${randomUUID()}`;
  }

  assertTenantKey(organizationId: string, objectKey: string): void {
    if (!UUID_PATTERN.test(organizationId) || !objectKey.startsWith(`${organizationId}/`)) {
      throw new TypeError("Object key is outside the organization prefix");
    }
  }

  async put(input: StoredObjectBody): Promise<StoredObjectResult> {
    const objectKey = this.objectKey(input.organizationId, input.purpose);
    const digest = createHash("sha256").update(input.body).digest("hex");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.contentType,
        ContentEncoding: input.contentEncoding,
        Metadata: { sha256: digest },
        ...(this.serverSideEncryption ? { ServerSideEncryption: this.serverSideEncryption } : {}),
      }),
    );
    return {
      bucket: this.bucket,
      objectKey,
      byteSize: input.body.byteLength,
      sha256Digest: digest,
      contentType: input.contentType,
      contentEncoding: input.contentEncoding ?? null,
    };
  }

  async verify(result: StoredObjectResult): Promise<void> {
    const metadata = await this.client.send(
      new HeadObjectCommand({ Bucket: result.bucket, Key: result.objectKey }),
    );
    if (
      metadata.ContentLength !== result.byteSize ||
      metadata.Metadata?.sha256 !== result.sha256Digest
    ) {
      throw new Error("Stored object verification failed");
    }
  }

  async read(organizationId: string, objectKey: string, maximumBytes: number): Promise<Uint8Array> {
    this.assertTenantKey(organizationId, objectKey);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if ((response.ContentLength ?? 0) > maximumBytes)
      throw new RangeError("Object exceeds read limit");
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error("Stored object has no body");
    if (bytes.byteLength > maximumBytes) throw new RangeError("Object exceeds read limit");
    return bytes;
  }

  async signedReadUrl(organizationId: string, objectKey: string, expiresIn = 300): Promise<string> {
    this.assertTenantKey(organizationId, objectKey);
    if (expiresIn < 30 || expiresIn > 900)
      throw new RangeError("Signed URL expiry must be 30–900s");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn },
    );
  }

  async delete(organizationId: string, objectKey: string): Promise<void> {
    this.assertTenantKey(organizationId, objectKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}
