import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { memberships, organizations } from "./identity";
import { createdAt, mutableTimestamps, softDelete, uuidPrimaryKey } from "./shared/columns";
import { environmentKind, serviceStatus } from "./shared/enums";

export const apiServices = pgTable(
  "api_services",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: serviceStatus("status").notNull().default("onboarding"),
    ownerMembershipId: uuid("owner_membership_id").notNull(),
    firstCaptureAt: timestamp("first_capture_at", { withTimezone: true }),
    firstUsefulLedgerAt: timestamp("first_useful_ledger_at", { withTimezone: true }),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [
    uniqueIndex("api_services_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("api_services_active_slug_uq")
      .on(table.organizationId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    foreignKey({
      name: "api_services_owner_fk",
      columns: [table.organizationId, table.ownerMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    index("api_services_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const serviceEnvironments = pgTable(
  "service_environments",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: environmentKind("kind").notNull(),
    baseUrlOrigin: text("base_url_origin"),
    captureEnabled: boolean("capture_enabled").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [
    uniqueIndex("service_environments_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("service_environments_slug_uq").on(table.apiServiceId, table.slug),
    uniqueIndex("service_environments_default_uq")
      .on(table.apiServiceId)
      .where(sql`${table.isDefault} and ${table.deletedAt} is null`),
    foreignKey({
      name: "service_environments_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
  ],
);

export const extractorReleases = pgTable(
  "extractor_releases",
  {
    id: uuidPrimaryKey(),
    semanticVersion: text("semantic_version").notNull(),
    sourceCommitSha: text("source_commit_sha").notNull(),
    binaryDigest: text("binary_digest").notNull(),
    fingerprintSchemaVersion: integer("fingerprint_schema_version").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("extractor_releases_semver_uq").on(table.semanticVersion),
    uniqueIndex("extractor_releases_binary_digest_uq").on(table.binaryDigest),
  ],
);

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    apiServiceId: uuid("api_service_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    currentStep: text("current_step").notNull(),
    completedSteps: text("completed_steps").array().notNull().default(sql`ARRAY[]::text[]`),
    dismissedSteps: text("dismissed_steps").array().notNull().default(sql`ARRAY[]::text[]`),
    lastErrorCode: text("last_error_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("onboarding_progress_org_id_uq").on(table.organizationId, table.apiServiceId),
    foreignKey({
      name: "onboarding_progress_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
  ],
);
