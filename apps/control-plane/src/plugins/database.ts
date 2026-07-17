import { assertSafeDatabasePrincipal, createDatabaseClient } from "@hyrum/db";
import type { RuntimeEnv } from "@hyrum/env";
import fp from "fastify-plugin";

export const databasePlugin = fp<{ env: RuntimeEnv }>(async (app, options) => {
  const database = createDatabaseClient(
    options.env.DATABASE_URL,
    options.env.DATABASE_POOL_MAX,
    options.env.DATABASE_SSL,
  );
  try {
    await assertSafeDatabasePrincipal(database.sql, options.env.NODE_ENV === "production");
  } catch (error) {
    await database.close();
    throw error;
  }
  app.decorate("database", database);
  app.addHook("onClose", async () => database.close());
});
