import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { memberships, organizationKeyVersions, organizations } from "./identity";
import { apiServices } from "./services";
import { createdAt, mutableTimestamps, uuidPrimaryKey } from "./shared/columns";
import { allowedOperationMode, configurationStatus } from "./shared/enums";
import { storedObjects } from "./storage";

export const redactionPolicyVersions = pgTable(
  "redaction_policy_versions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    version: integer("version").notNull(),
    status: configurationStatus("status").notNull().default("draft"),
    celSource: text("cel_source").notNull(),
    compiledDigest: text("compiled_digest").notNull(),
    structuralHmacKeyVersionId: uuid("structural_hmac_key_version_id").notNull(),
    consumerHmacKeyVersionId: uuid("consumer_hmac_key_version_id").notNull(),
    createdByMembershipId: uuid("created_by_membership_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("redaction_policy_versions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("redaction_policy_versions_service_version_uq").on(
      table.apiServiceId,
      table.version,
    ),
    uniqueIndex("redaction_policy_versions_active_uq")
      .on(table.apiServiceId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      name: "redaction_policy_versions_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "redaction_policy_versions_structural_key_fk",
      columns: [table.organizationId, table.structuralHmacKeyVersionId],
      foreignColumns: [organizationKeyVersions.organizationId, organizationKeyVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "redaction_policy_versions_consumer_key_fk",
      columns: [table.organizationId, table.consumerHmacKeyVersionId],
      foreignColumns: [organizationKeyVersions.organizationId, organizationKeyVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "redaction_policy_versions_creator_fk",
      columns: [table.organizationId, table.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    check("redaction_policy_versions_version_ck", sql`${table.version} > 0`),
  ],
);

export const samplingPolicyVersions = pgTable(
  "sampling_policy_versions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    version: integer("version").notNull(),
    sessionWindowSeconds: integer("session_window_seconds").notNull(),
    baseSampleRate: numeric("base_sample_rate", { precision: 6, scale: 5 }).notNull(),
    lowVolumeThreshold: integer("low_volume_threshold").notNull(),
    lowVolumeBoost: numeric("low_volume_boost", { precision: 6, scale: 2 }).notNull(),
    correlationHeaderNames: text("correlation_header_names")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    compiledDigest: text("compiled_digest").notNull(),
    status: configurationStatus("status").notNull().default("draft"),
    createdByMembershipId: uuid("created_by_membership_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("sampling_policy_versions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("sampling_policy_versions_service_version_uq").on(
      table.apiServiceId,
      table.version,
    ),
    uniqueIndex("sampling_policy_versions_active_uq")
      .on(table.apiServiceId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      name: "sampling_policy_versions_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "sampling_policy_versions_creator_fk",
      columns: [table.organizationId, table.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    check("sampling_policy_versions_version_ck", sql`${table.version} > 0`),
    check("sampling_policy_versions_window_ck", sql`${table.sessionWindowSeconds} > 0`),
    check(
      "sampling_policy_versions_rate_ck",
      sql`${table.baseSampleRate} >= 0 and ${table.baseSampleRate} <= 1`,
    ),
    check("sampling_policy_versions_threshold_ck", sql`${table.lowVolumeThreshold} >= 0`),
    check("sampling_policy_versions_boost_ck", sql`${table.lowVolumeBoost} >= 1`),
  ],
);

export const maskProfileVersions = pgTable(
  "mask_profile_versions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    version: integer("version").notNull(),
    rules: jsonb("rules").notNull(),
    rulesDigest: text("rules_digest").notNull(),
    status: configurationStatus("status").notNull().default("draft"),
    createdByMembershipId: uuid("created_by_membership_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("mask_profile_versions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("mask_profile_versions_service_version_uq").on(table.apiServiceId, table.version),
    uniqueIndex("mask_profile_versions_active_uq")
      .on(table.apiServiceId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      name: "mask_profile_versions_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "mask_profile_versions_creator_fk",
      columns: [table.organizationId, table.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    check("mask_profile_versions_version_ck", sql`${table.version} > 0`),
  ],
);

export const replayProfiles = pgTable(
  "replay_profiles",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    maskProfileVersionId: uuid("mask_profile_version_id").notNull(),
    fixtureObjectId: uuid("fixture_object_id"),
    stubObjectId: uuid("stub_object_id"),
    allowedOperationMode: allowedOperationMode("allowed_operation_mode")
      .notNull()
      .default("read_only"),
    networkEgressEnabled: boolean("network_egress_enabled").notNull().default(false),
    requestTimeoutMs: integer("request_timeout_ms").notNull(),
    resourceLimits: jsonb("resource_limits").notNull().default({}),
    configDigest: text("config_digest").notNull(),
    status: configurationStatus("status").notNull().default("draft"),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("replay_profiles_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("replay_profiles_service_version_uq").on(table.apiServiceId, table.version),
    uniqueIndex("replay_profiles_active_uq")
      .on(table.apiServiceId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      name: "replay_profiles_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_profiles_mask_fk",
      columns: [table.organizationId, table.maskProfileVersionId],
      foreignColumns: [maskProfileVersions.organizationId, maskProfileVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_profiles_fixture_fk",
      columns: [table.organizationId, table.fixtureObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_profiles_stub_fk",
      columns: [table.organizationId, table.stubObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    check("replay_profiles_version_ck", sql`${table.version} > 0`),
    check("replay_profiles_timeout_ck", sql`${table.requestTimeoutMs} > 0`),
  ],
);
