import { sql } from "drizzle-orm";
import type { Database } from "./index";

export type TenantDb = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function withTenant<T>(
  db: Database,
  organizationId: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}

export async function withHumanAuthLookup<T>(
  db: Database,
  workosUserId: string,
  workosOrganizationId: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workos_user_id', ${workosUserId}, true)`);
    await tx.execute(
      sql`select set_config('app.workos_organization_id', ${workosOrganizationId}, true)`,
    );
    return fn(tx);
  });
}

export async function withMachineAuthLookup<T>(
  db: Database,
  tokenPrefix: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.agent_token_prefix', ${tokenPrefix}, true)`);
    return fn(tx);
  });
}
