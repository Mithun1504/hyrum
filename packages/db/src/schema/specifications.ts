import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { memberships, organizations } from "./identity";
import { apiServices } from "./services";
import { createdAt, mutableTimestamps, uuidPrimaryKey } from "./shared/columns";
import { apiSpecSource, validationStatus } from "./shared/enums";
import { storedObjects } from "./storage";

export const apiSpecs = pgTable(
  "api_specs",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    versionLabel: text("version_label").notNull(),
    source: apiSpecSource("source").notNull(),
    sourceReference: text("source_reference"),
    originalObjectId: uuid("original_object_id").notNull(),
    normalizedObjectId: uuid("normalized_object_id").notNull(),
    originalDigest: text("original_digest").notNull(),
    normalizedDigest: text("normalized_digest").notNull(),
    openapiVersion: text("openapi_version").notNull(),
    validationStatus: validationStatus("validation_status").notNull().default("pending"),
    validationErrors: jsonb("validation_errors").notNull().default([]),
    isCurrent: boolean("is_current").notNull().default(false),
    supersedesSpecId: uuid("supersedes_spec_id"),
    uploadedByMembershipId: uuid("uploaded_by_membership_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("api_specs_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("api_specs_service_digest_uq").on(table.apiServiceId, table.normalizedDigest),
    uniqueIndex("api_specs_current_uq").on(table.apiServiceId).where(sql`${table.isCurrent}`),
    foreignKey({
      name: "api_specs_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "api_specs_original_object_fk",
      columns: [table.organizationId, table.originalObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "api_specs_normalized_object_fk",
      columns: [table.organizationId, table.normalizedObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "api_specs_uploader_fk",
      columns: [table.organizationId, table.uploadedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    foreignKey({
      name: "api_specs_supersedes_fk",
      columns: [table.organizationId, table.supersedesSpecId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    index("api_specs_service_created_idx").on(table.apiServiceId, table.createdAt),
  ],
);

export const apiOperations = pgTable(
  "api_operations",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    httpMethod: text("http_method").notNull(),
    normalizedPathTemplate: text("normalized_path_template").notNull(),
    operationKey: text("operation_key").notNull(),
    displayName: text("display_name"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("api_operations_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("api_operations_identity_uq").on(
      table.apiServiceId,
      table.httpMethod,
      table.normalizedPathTemplate,
    ),
    uniqueIndex("api_operations_key_uq").on(table.apiServiceId, table.operationKey),
    foreignKey({
      name: "api_operations_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
  ],
);

export const apiSpecOperations = pgTable(
  "api_spec_operations",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiSpecId: uuid("api_spec_id").notNull(),
    apiOperationId: uuid("api_operation_id").notNull(),
    operationIdText: text("operation_id_text"),
    summary: text("summary"),
    normalizedContract: jsonb("normalized_contract").notNull(),
    contractDigest: text("contract_digest").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("api_spec_operations_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("api_spec_operations_spec_operation_uq").on(table.apiSpecId, table.apiOperationId),
    foreignKey({
      name: "api_spec_operations_spec_fk",
      columns: [table.organizationId, table.apiSpecId],
      foreignColumns: [apiSpecs.organizationId, apiSpecs.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "api_spec_operations_operation_fk",
      columns: [table.organizationId, table.apiOperationId],
      foreignColumns: [apiOperations.organizationId, apiOperations.id],
    }).onDelete("cascade"),
    index("api_spec_operations_operation_idx").on(table.apiOperationId, table.apiSpecId),
  ],
);
