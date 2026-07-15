import { sql } from "drizzle-orm";
import type { Database } from "./index";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Set the fail-closed RLS context for the current database transaction. */
export async function setOrganizationContext(
  transaction: DatabaseTransaction,
  organizationId: string,
): Promise<void> {
  if (!UUID_PATTERN.test(organizationId)) {
    throw new TypeError("organizationId must be a valid UUID");
  }

  await transaction.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
}

/** Execute tenant-owned database work in a transaction with a transaction-local RLS context. */
export async function withOrganizationContext<T>(
  database: Database,
  organizationId: string,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await setOrganizationContext(transaction, organizationId);
    return operation(transaction);
  });
}
