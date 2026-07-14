import { hostname } from "node:os";
import { createDatabaseClient } from "@hyrum/db";
import { parseRuntimeEnv } from "@hyrum/env";
import { createLogger } from "@hyrum/logger";
import { runWorker } from "./runner";

const env = parseRuntimeEnv();
const logger = createLogger("worker", env.LOG_LEVEL);
const database = createDatabaseClient(env.DATABASE_URL, env.DATABASE_POOL_MAX);
const controller = new AbortController();

const stop = () => controller.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

logger.info({ workerId: hostname() }, "worker started");
await runWorker({ db: database.db, logger, workerId: hostname() }, controller.signal);
await database.close();
logger.info("worker stopped");
