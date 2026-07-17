import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as aiSchema from "./ai-schema";
import * as productSchema from "./product-schema";
import * as schema from "./schema";

const combinedSchema = { ...schema, ...productSchema, ...aiSchema };

export type Database = ReturnType<typeof drizzle<typeof combinedSchema>>;

export interface DatabaseClient {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
}

interface DatabasePrincipal {
  role_name: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export async function assertSafeDatabasePrincipal(sql: Sql, production: boolean): Promise<void> {
  if (!production) return;
  const [principal] = await sql<DatabasePrincipal[]>`
    select current_user as role_name, rolsuper, rolbypassrls
    from pg_catalog.pg_roles
    where rolname = current_user
  `;
  if (!principal) throw new Error("Unable to verify the production database principal");
  if (principal.rolsuper || principal.rolbypassrls) {
    throw new Error(
      `Production database principal ${principal.role_name} must be NOSUPERUSER and NOBYPASSRLS`,
    );
  }
}

export function createDatabaseClient(
  connectionString: string,
  max = 10,
  ssl = false,
): DatabaseClient {
  const sql = postgres(connectionString, { max, prepare: false, ssl: ssl ? "verify-full" : false });
  const db = drizzle(sql, { schema: combinedSchema });
  return { db, sql, close: () => sql.end() };
}

export { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
export * from "./ai-schema";
export * from "./jobs";
export * from "./outbox";
export * from "./product-schema";
export * from "./schema";
export * from "./tenant";
