import type { RuntimeEnv } from "@hyrum/env";
import { createObjectStorage } from "@hyrum/storage";
import fp from "fastify-plugin";

export const storagePlugin = fp<{ env: RuntimeEnv }>(async (app, options) => {
  const env = options.env;
  app.decorate(
    "objectStorage",
    createObjectStorage({
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      region: env.OBJECT_STORAGE_REGION,
      bucket: env.OBJECT_STORAGE_BUCKET,
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
      maxObjectBytes: env.OBJECT_STORAGE_MAX_OBJECT_BYTES,
      presignMaxSeconds: env.OBJECT_STORAGE_PRESIGN_MAX_SECONDS,
      serverSideEncryption: env.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION,
      ...(env.OBJECT_STORAGE_KMS_KEY_ID ? { kmsKeyId: env.OBJECT_STORAGE_KMS_KEY_ID } : {}),
    }),
  );
});
