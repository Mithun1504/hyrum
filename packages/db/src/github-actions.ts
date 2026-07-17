import { sql } from "drizzle-orm";
import type { Database } from "./index";

interface ResolvedConnectionRow extends Record<string, unknown> {
  organization_id: string;
  api_service_id: string;
  repository_connection_id: string;
  repository_full_name: string;
}

/** Resolve an OIDC-authenticated GitHub repository through a narrowly scoped SECURITY DEFINER function. */
export async function resolveGitHubActionConnection(
  db: Database,
  repositoryId: bigint,
  serviceSlug: string,
) {
  const rows = await db.execute<ResolvedConnectionRow>(sql`
    select * from hyrum_resolve_github_action_connection(${repositoryId}, ${serviceSlug})
  `);
  if (rows.length > 1) throw new Error("GitHub repository connection is ambiguous");
  const row = rows[0];
  return row
    ? {
        organizationId: row.organization_id,
        apiServiceId: row.api_service_id,
        repositoryConnectionId: row.repository_connection_id,
        repositoryFullName: row.repository_full_name,
      }
    : null;
}
