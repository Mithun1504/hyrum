import type { OrganizationRole } from "@hyrum/contracts";
import { eq } from "drizzle-orm";
import type { Sql } from "postgres";
import type { Database } from "./index";
import { organizationSettings, organizations } from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface ResolvedHumanMembership {
  organizationId: string;
  userId: string;
  membershipId: string;
  role: OrganizationRole;
  lastAuthenticatedAt: Date | null;
}

export interface WorkosMembershipSnapshot {
  workosOrganizationId: string;
  organizationName: string;
  organizationSlug: string;
  workosUserId: string;
  userEmail: string;
  userDisplayName: string | null;
  userAvatarUrl: string | null;
  lastAuthenticatedAt: Date;
  workosMembershipId: string;
  role: OrganizationRole;
  status: "invited" | "active" | "suspended" | "revoked";
}

interface HumanMembershipRow {
  organization_id: string;
  user_id: string;
  membership_id: string;
  role: OrganizationRole;
  last_authenticated_at: Date | null;
}

/**
 * Resolve WorkOS identifiers through the narrowly-scoped SECURITY DEFINER
 * function installed by the identity-bootstrap migration. No tenant ID or
 * role supplied by a browser is accepted as product authorization.
 */
export async function resolveHumanMembership(
  sql: Sql,
  workosUserId: string,
  workosOrganizationId: string,
): Promise<ResolvedHumanMembership | null> {
  const rows = await sql<HumanMembershipRow[]>`
    select organization_id, user_id, membership_id, role, last_authenticated_at
    from hyrum_resolve_human_membership(${workosUserId}, ${workosOrganizationId})
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    membershipId: row.membership_id,
    role: row.role,
    lastAuthenticatedAt: row.last_authenticated_at,
  };
}

export async function syncWorkosMembership(
  sql: Sql,
  snapshot: WorkosMembershipSnapshot,
): Promise<ResolvedHumanMembership> {
  const rows = await sql<HumanMembershipRow[]>`
    select organization_id, user_id, membership_id, role, last_authenticated_at
    from hyrum_sync_workos_membership(
      ${snapshot.workosOrganizationId},
      ${snapshot.organizationName},
      ${snapshot.organizationSlug},
      ${snapshot.workosUserId},
      ${snapshot.userEmail},
      ${snapshot.userDisplayName},
      ${snapshot.userAvatarUrl},
      ${snapshot.lastAuthenticatedAt.toISOString()},
      ${snapshot.workosMembershipId},
      ${snapshot.role},
      ${snapshot.status}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("WorkOS membership synchronization returned no membership");
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    membershipId: row.membership_id,
    role: row.role,
    lastAuthenticatedAt: row.last_authenticated_at,
  };
}

export interface OrganizationSummaryRecord {
  id: string;
  slug: string;
  name: string;
  status: "provisioning" | "active" | "suspended" | "deleting" | "deleted";
  region: string;
  retentionDays: number;
  staleAfterDays: number;
  timezone: string;
  defaultAssertionDays: number;
  defaultReceiptTtlDays: number;
  notificationDigestEnabled: boolean;
  dataExportEnabled: boolean;
}

export interface IdentityOrganizationRecord {
  organizationId: string;
  workosOrganizationId: string;
  membershipId: string;
  slug: string;
  name: string;
  status: "provisioning" | "active";
  role: OrganizationRole;
}

interface IdentityOrganizationRow {
  organization_id: string;
  workos_organization_id: string;
  membership_id: string;
  slug: string;
  name: string;
  status: "provisioning" | "active";
  role: OrganizationRole;
}

export async function listHumanOrganizations(
  sql: Sql,
  workosUserId: string,
): Promise<IdentityOrganizationRecord[]> {
  const rows = await sql<IdentityOrganizationRow[]>`
    select organization_id, workos_organization_id, membership_id, slug, name, status, role
    from hyrum_list_human_organizations(${workosUserId})
  `;
  return rows.map((row) => ({
    organizationId: row.organization_id,
    workosOrganizationId: row.workos_organization_id,
    membershipId: row.membership_id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    role: row.role,
  }));
}

export async function getOrganizationSummary(
  db: Database,
  organizationId: string,
): Promise<OrganizationSummaryRecord | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        status: organizations.status,
        region: organizations.region,
        retentionDays: organizations.retentionDays,
        staleAfterDays: organizations.staleAfterDays,
        timezone: organizationSettings.timezone,
        defaultAssertionDays: organizationSettings.defaultAssertionDays,
        defaultReceiptTtlDays: organizationSettings.defaultReceiptTtlDays,
        notificationDigestEnabled: organizationSettings.notificationDigestEnabled,
        dataExportEnabled: organizationSettings.dataExportEnabled,
      })
      .from(organizations)
      .innerJoin(organizationSettings, eq(organizationSettings.organizationId, organizations.id))
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return record ?? null;
  });
}
