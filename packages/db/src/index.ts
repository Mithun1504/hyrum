import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseClient {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
}

export function createDatabaseClient(connectionString: string, max = 10): DatabaseClient {
  const sql = postgres(connectionString, { max, prepare: false });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end() };
}

export * from "./jobs";
export * from "./schema";
export * from "./tenancy";
