import { z } from "zod";

export const organizationRoleSchema = z.enum(["owner", "admin", "engineer", "viewer"]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const principalTypeSchema = z.enum([
  "human",
  "capture_agent",
  "ci_runner",
  "internal_service",
  "platform_operator",
]);
export type PrincipalType = z.infer<typeof principalTypeSchema>;

export const permissionSchema = z.enum([
  "organization:read",
  "organization:update",
  "organization:delete",
  "organization:transfer",
  "member:read",
  "member:invite",
  "member:manage",
  "service:read",
  "service:manage",
  "spec:read",
  "spec:manage",
  "agent:read",
  "agent:manage",
  "ingestion:write",
  "ledger:read",
  "claim:review",
  "assertion:read",
  "assertion:manage",
  "corpus:read",
  "corpus:manage",
  "replay:read",
  "replay:run",
  "replay:report",
  "policy:read",
  "policy:manage",
  "gate:read",
  "gate:exception:request",
  "gate:exception:approve",
  "integration:read",
  "integration:manage",
  "report:read",
  "audit:read",
  "privacy:manage",
  "support:operate",
]);
export type Permission = z.infer<typeof permissionSchema>;

const viewerPermissions = [
  "organization:read",
  "member:read",
  "service:read",
  "spec:read",
  "agent:read",
  "ledger:read",
  "assertion:read",
  "corpus:read",
  "replay:read",
  "policy:read",
  "gate:read",
  "integration:read",
  "report:read",
] as const satisfies readonly Permission[];

const engineerPermissions = [
  ...viewerPermissions,
  "spec:manage",
  "claim:review",
  "assertion:manage",
  "corpus:manage",
  "replay:run",
  "gate:exception:request",
] as const satisfies readonly Permission[];

const adminPermissions = [
  ...engineerPermissions,
  "organization:update",
  "member:invite",
  "member:manage",
  "service:manage",
  "agent:manage",
  "policy:manage",
  "gate:exception:approve",
  "integration:manage",
  "audit:read",
] as const satisfies readonly Permission[];

export const rolePermissions = {
  viewer: viewerPermissions,
  engineer: engineerPermissions,
  admin: adminPermissions,
  owner: [...adminPermissions, "organization:delete", "organization:transfer", "privacy:manage"],
} as const satisfies Record<OrganizationRole, readonly Permission[]>;

export function permissionsForRole(role: OrganizationRole): readonly Permission[] {
  return rolePermissions[role];
}

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return (rolePermissions[role] as readonly Permission[]).includes(permission);
}

export const actorContextSchema = z.object({
  actorId: z.uuid(),
  principalType: principalTypeSchema,
  externalSubject: z.string().min(1).optional(),
  membershipId: z.uuid().optional(),
  role: organizationRoleSchema.optional(),
  permissions: z.array(permissionSchema),
  recentlyAuthenticated: z.boolean(),
  supportAccessGrantId: z.uuid().optional(),
});
export type ActorContext = z.infer<typeof actorContextSchema>;

export const requestContextSchema = z.object({
  requestId: z.string().min(1),
  organizationId: z.uuid(),
  actor: actorContextSchema,
});
export type RequestContext = z.infer<typeof requestContextSchema>;

export const identityContextSchema = z.object({
  requestId: z.string().min(1),
  externalSubject: z.string().min(1),
  workosOrganizationId: z.string().min(1).optional(),
  recentlyAuthenticated: z.boolean(),
});
export type IdentityContext = z.infer<typeof identityContextSchema>;

export const sessionResponseSchema = z.object({
  actorId: z.uuid(),
  organizationId: z.uuid(),
  membershipId: z.uuid(),
  role: organizationRoleSchema,
  permissions: z.array(permissionSchema),
  recentlyAuthenticated: z.boolean(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const organizationSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["provisioning", "active", "suspended", "deleting", "deleted"]),
  region: z.string(),
  retentionDays: z.number().int().min(1).max(365),
  staleAfterDays: z.number().int().positive(),
  timezone: z.string(),
  defaultAssertionDays: z.number().int().positive(),
  defaultReceiptTtlDays: z.number().int().positive(),
  notificationDigestEnabled: z.boolean(),
  dataExportEnabled: z.boolean(),
});
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

export const identityOrganizationSchema = z.object({
  organizationId: z.uuid(),
  workosOrganizationId: z.string().min(1),
  membershipId: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["provisioning", "active"]),
  role: organizationRoleSchema,
});
export type IdentityOrganization = z.infer<typeof identityOrganizationSchema>;

export const identityOrganizationListSchema = z.object({
  data: z.array(identityOrganizationSchema),
});
export type IdentityOrganizationList = z.infer<typeof identityOrganizationListSchema>;
