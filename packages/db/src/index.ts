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

export * from "./advisories";
export * from "./agents";
export * from "./assertion-jobs";
export * from "./assertions";
export * from "./behavior-advisories";
export * from "./corpora";
export * from "./draft-advisories";
export * from "./evaluations";
export * from "./evidence-inference";
export * from "./gate-decisions";
export * from "./gate-exceptions";
export * from "./gate-policies";
export * from "./github";
export * from "./github-actions";
export * from "./github-checks";
export * from "./identity";
export * from "./ingestion-processing";
export * from "./insights";
export * from "./jobs";
export * from "./ledger";
export * from "./live-events";
export * from "./maintenance";
export * from "./members";
export * from "./notification-delivery";
export * from "./notifications";
export * from "./organization-settings";
export * from "./platform-operations";
export * from "./privacy";
export * from "./replay-runs";
export * from "./reporting";
export * from "./repository-connections";
export * from "./schema";
export * from "./search";
export * from "./services";
export * from "./slack";
export * from "./specifications";
export * from "./tenancy";
export * from "./webhooks";
