import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, createdAt, mutableTimestamps, softDelete, uuidPrimaryKey } from "./shared/columns";
import {
  invitationStatus,
  keyPurpose,
  keyVersionStatus,
  membershipStatus,
  organizationRole,
  organizationStatus,
  platformOperatorStatus,
} from "./shared/enums";

export const organizations = pgTable(
  "organizations",
  {
    id: uuidPrimaryKey(),
    workosOrganizationId: text("workos_organization_id").notNull(),
    slug: citext("slug").notNull(),
    name: text("name").notNull(),
    status: organizationStatus("status").notNull().default("provisioning"),
    region: text("region").notNull().default("auto"),
    retentionDays: smallint("retention_days").notNull().default(30),
    staleAfterDays: smallint("stale_after_days").notNull().default(90),
    settingsVersion: integer("settings_version").notNull().default(1),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [
    uniqueIndex("organizations_workos_id_uq").on(table.workosOrganizationId),
    uniqueIndex("organizations_slug_uq").on(table.slug),
    index("organizations_active_idx").on(table.status).where(sql`${table.deletedAt} is null`),
    check("organizations_retention_days_ck", sql`${table.retentionDays} between 1 and 365`),
    check("organizations_stale_after_days_ck", sql`${table.staleAfterDays} > 0`),
    check("organizations_settings_version_ck", sql`${table.settingsVersion} > 0`),
  ],
);

export const organizationSettings = pgTable(
  "organization_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    defaultAssertionDays: smallint("default_assertion_days").notNull().default(90),
    defaultReceiptTtlDays: smallint("default_receipt_ttl_days").notNull().default(30),
    lowVolumeSamplingBoost: numeric("low_volume_sampling_boost", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("1.00"),
    notificationDigestEnabled: boolean("notification_digest_enabled").notNull().default(true),
    dataExportEnabled: boolean("data_export_enabled").notNull().default(true),
    ...mutableTimestamps(),
  },
  (table) => [
    check("organization_settings_assertion_days_ck", sql`${table.defaultAssertionDays} > 0`),
    check("organization_settings_receipt_ttl_ck", sql`${table.defaultReceiptTtlDays} > 0`),
    check("organization_settings_boost_ck", sql`${table.lowVolumeSamplingBoost} >= 1`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuidPrimaryKey(),
    workosUserId: text("workos_user_id").notNull(),
    primaryEmail: citext("primary_email").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true }),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [uniqueIndex("users_workos_id_uq").on(table.workosUserId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    workosMembershipId: text("workos_membership_id"),
    role: organizationRole("role").notNull().default("viewer"),
    status: membershipStatus("status").notNull().default("invited"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("memberships_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("memberships_org_user_uq").on(table.organizationId, table.userId),
    uniqueIndex("memberships_workos_id_uq")
      .on(table.workosMembershipId)
      .where(sql`${table.workosMembershipId} is not null`),
    index("memberships_user_status_idx").on(table.userId, table.status),
    index("memberships_org_role_status_idx").on(table.organizationId, table.role, table.status),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    email: citext("email").notNull(),
    role: organizationRole("role").notNull(),
    workosInvitationId: text("workos_invitation_id").notNull(),
    invitedByMembershipId: uuid("invited_by_membership_id").notNull(),
    status: invitationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("invitations_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("invitations_workos_id_uq").on(table.workosInvitationId),
    uniqueIndex("invitations_pending_email_uq")
      .on(table.organizationId, table.email)
      .where(sql`${table.status} = 'pending'`),
    foreignKey({
      name: "invitations_inviter_fk",
      columns: [table.organizationId, table.invitedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    check("invitations_expiry_ck", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const platformOperators = pgTable(
  "platform_operators",
  {
    id: uuidPrimaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    status: platformOperatorStatus("status").notNull().default("active"),
    capabilities: text("capabilities").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("platform_operators_user_uq").on(table.userId)],
);

export const supportAccessGrants = pgTable(
  "support_access_grants",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    platformOperatorId: uuid("platform_operator_id")
      .notNull()
      .references(() => platformOperators.id, { onDelete: "restrict" }),
    approvedByOperatorId: uuid("approved_by_operator_id").references(() => platformOperators.id, {
      onDelete: "restrict",
    }),
    reason: text("reason").notNull(),
    ticketReference: text("ticket_reference").notNull(),
    scopes: text("scopes").array().notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("support_access_grants_org_id_uq").on(table.organizationId, table.id),
    index("support_access_grants_active_idx").on(table.organizationId, table.expiresAt),
    check("support_access_grants_window_ck", sql`${table.expiresAt} > ${table.startsAt}`),
    check(
      "support_access_grants_approver_ck",
      sql`${table.approvedByOperatorId} is null or ${table.approvedByOperatorId} <> ${table.platformOperatorId}`,
    ),
  ],
);

export const organizationKeyVersions = pgTable(
  "organization_key_versions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    purpose: keyPurpose("purpose").notNull(),
    version: integer("version").notNull(),
    kmsKeyReference: text("kms_key_reference").notNull(),
    status: keyVersionStatus("status").notNull().default("pending"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retireAfter: timestamp("retire_after", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("organization_key_versions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("organization_key_versions_version_uq").on(
      table.organizationId,
      table.purpose,
      table.version,
    ),
    uniqueIndex("organization_key_versions_active_uq")
      .on(table.organizationId, table.purpose)
      .where(sql`${table.status} = 'active'`),
    check("organization_key_versions_version_ck", sql`${table.version} > 0`),
  ],
);
