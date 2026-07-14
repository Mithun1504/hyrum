import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabaseClient } from "./index";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to run migrations");

const client = createDatabaseClient(connectionString, 1);
try {
  await migrate(client.db, {
    migrationsFolder: new URL("../migrations", import.meta.url).pathname,
  });
} finally {
  await client.close();
}
