import { hostname } from "node:os";
import { parseRuntimeEnv } from "@hyrum/env";
import { startTelemetry, stopTelemetry } from "./telemetry";

async function main() {
  const env = parseRuntimeEnv();
  startTelemetry(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const [dbModule, loggerModule, storageModule, configModule, handlersModule, runnerModule] =
    await Promise.all([
      import("@hyrum/db"),
      import("@hyrum/logger"),
      import("@hyrum/storage"),
      import("./config"),
      import("./handlers"),
      import("./runner"),
    ]);
  const { assertSafeDatabasePrincipal, createDatabaseClient } = dbModule;
  const { createLogger } = loggerModule;
  const { createObjectStorage } = storageModule;
  const { workerDatabaseUrl } = configModule;
  const { createDefaultHandlers } = handlersModule;
  const { runWorker } = runnerModule;
  const logger = createLogger("worker", env.LOG_LEVEL);
  const database = createDatabaseClient(
    workerDatabaseUrl(env),
    env.DATABASE_POOL_MAX,
    env.DATABASE_SSL,
  );
  const controller = new AbortController();
  const objectStorage = createObjectStorage({
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
  });

  try {
    await assertSafeDatabasePrincipal(database.sql, env.NODE_ENV === "production");
  } catch (error) {
    await database.close();
    throw error;
  }

  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  logger.info({ workerId: hostname() }, "worker started");
  await runWorker(
    {
      db: database.db,
      logger,
      workerId: hostname(),
      handlers: createDefaultHandlers({
        objectStorage,
        ...(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY
          ? { githubApp: { appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY } }
          : {}),
        ...(env.SLACK_BOT_TOKEN ? { slackBotToken: env.SLACK_BOT_TOKEN } : {}),
      }),
    },
    controller.signal,
  );
  await database.close();
  await stopTelemetry();
  logger.info("worker stopped");
}

if (!process.argv.includes("--verify-bundle")) await main();
