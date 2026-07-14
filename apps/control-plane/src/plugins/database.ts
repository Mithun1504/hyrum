import { createDatabaseClient } from "@hyrum/db";
import type { RuntimeEnv } from "@hyrum/env";
import fp from "fastify-plugin";

export const databasePlugin = fp<{ env: RuntimeEnv }>(async (app, options) => {
  const database = createDatabaseClient(options.env.DATABASE_URL, options.env.DATABASE_POOL_MAX);
  app.decorate("database", database);
  app.addHook("onClose", async () => database.close());
});
