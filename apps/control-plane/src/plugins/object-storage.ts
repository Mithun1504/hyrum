import type { RuntimeEnv } from "@hyrum/env";
import { ObjectStorage } from "@hyrum/storage";
import fp from "fastify-plugin";

export const objectStoragePlugin = fp<{ env: RuntimeEnv }>(async (app, options) => {
  const { env } = options;
  const objectStorage = new ObjectStorage({
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : {}),
  });
  app.decorate("objectStorage", objectStorage);
});
