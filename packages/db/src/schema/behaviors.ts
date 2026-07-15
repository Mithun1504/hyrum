import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { llmRuns } from "./ai-core";
import { consumers } from "./capture";
import { memberships, organizations } from "./identity";
import { apiServices, extractorReleases, serviceEnvironments } from "./services";
import { createdAt, uuidPrimaryKey } from "./shared/columns";
import {
  behaviorClusterSource,
  behaviorKind,
  behaviorLabelSource,
  clusterMembershipSource,
  declarationStatus,
  reviewableStatus,
} from "./shared/enums";
import { apiOperations, apiSpecs } from "./specifications";

export const behaviorDefinitions = pgTable(
  "behavior_definitions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    apiOperationId: uuid("api_operation_id").notNull(),
    kind: behaviorKind("kind").notNull(),
    fingerprintSchemaVersion: integer("fingerprint_schema_version").notNull(),
    extractorReleaseId: uuid("extractor_release_id")
      .notNull()
      .references(() => extractorReleases.id, { onDelete: "restrict" }),
    canonicalFingerprint: jsonb("canonical_fingerprint").notNull(),
    fingerprintDigest: text("fingerprint_digest").notNull(),
    defaultLabel: text("default_label").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("behavior_definitions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("behavior_definitions_identity_uq").on(
      table.apiOperationId,
      table.extractorReleaseId,
      table.fingerprintDigest,
    ),
    foreignKey({
      name: "behavior_definitions_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_definitions_operation_fk",
      columns: [table.organizationId, table.apiOperationId],
      foreignColumns: [apiOperations.organizationId, apiOperations.id],
    }).onDelete("cascade"),
    index("behavior_definitions_operation_kind_idx").on(table.apiOperationId, table.kind),
  ],
);

export const behaviorLabels = pgTable(
  "behavior_labels",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    source: behaviorLabelSource("source").notNull(),
    llmRunId: uuid("llm_run_id"),
    status: reviewableStatus("status").notNull().default("proposed"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id"),
    supersedesLabelId: uuid("supersedes_label_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("behavior_labels_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("behavior_labels_active_uq")
      .on(table.behaviorDefinitionId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      name: "behavior_labels_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_labels_llm_run_fk",
      columns: [table.organizationId, table.llmRunId],
      foreignColumns: [llmRuns.organizationId, llmRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "behavior_labels_reviewer_fk",
      columns: [table.organizationId, table.reviewedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    foreignKey({
      name: "behavior_labels_supersedes_fk",
      columns: [table.organizationId, table.supersedesLabelId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    index("behavior_labels_label_trgm_idx").using("gin", sql`${table.label} gin_trgm_ops`),
  ],
);

export const behaviorClusters = pgTable(
  "behavior_clusters",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    source: behaviorClusterSource("source").notNull(),
    llmRunId: uuid("llm_run_id"),
    inputDigest: text("input_digest").notNull(),
    status: reviewableStatus("status").notNull().default("proposed"),
    supersedesClusterId: uuid("supersedes_cluster_id"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("behavior_clusters_org_id_uq").on(table.organizationId, table.id),
    foreignKey({
      name: "behavior_clusters_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_clusters_llm_run_fk",
      columns: [table.organizationId, table.llmRunId],
      foreignColumns: [llmRuns.organizationId, llmRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "behavior_clusters_reviewer_fk",
      columns: [table.organizationId, table.reviewedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    foreignKey({
      name: "behavior_clusters_supersedes_fk",
      columns: [table.organizationId, table.supersedesClusterId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    index("behavior_clusters_service_status_idx").on(table.apiServiceId, table.status),
  ],
);

export const behaviorClusterMembers = pgTable(
  "behavior_cluster_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    behaviorClusterId: uuid("behavior_cluster_id").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    membershipSource: clusterMembershipSource("membership_source").notNull(),
    score: numeric("score", { precision: 5, scale: 4 }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.behaviorClusterId, table.behaviorDefinitionId] }),
    foreignKey({
      name: "behavior_cluster_members_cluster_fk",
      columns: [table.organizationId, table.behaviorClusterId],
      foreignColumns: [behaviorClusters.organizationId, behaviorClusters.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_cluster_members_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    check(
      "behavior_cluster_members_score_ck",
      sql`${table.score} is null or (${table.score} >= 0 and ${table.score} <= 1)`,
    ),
  ],
);

export const behaviorSpecClassifications = pgTable(
  "behavior_spec_classifications",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    apiSpecId: uuid("api_spec_id").notNull(),
    status: declarationStatus("status").notNull(),
    reasonCode: text("reason_code").notNull(),
    comparisonDetails: jsonb("comparison_details").notNull(),
    comparatorVersion: text("comparator_version").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("behavior_spec_classifications_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("behavior_spec_classifications_identity_uq").on(
      table.behaviorDefinitionId,
      table.apiSpecId,
      table.comparatorVersion,
    ),
    foreignKey({
      name: "behavior_spec_classifications_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_spec_classifications_spec_fk",
      columns: [table.organizationId, table.apiSpecId],
      foreignColumns: [apiSpecs.organizationId, apiSpecs.id],
    }).onDelete("cascade"),
  ],
);

export const behaviorObservations = pgTable(
  "behavior_observations",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    id: bigint("id", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    environmentId: uuid("environment_id").notNull(),
    apiOperationId: uuid("api_operation_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    observationCount: bigint("observation_count", { mode: "number" }).notNull(),
    sessionCount: bigint("session_count", { mode: "number" }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    sampleWeight: numeric("sample_weight").notNull(),
    supportMetrics: jsonb("support_metrics").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.bucketStart, table.id] }),
    uniqueIndex("behavior_observations_dimensions_uq").on(
      table.bucketStart,
      table.environmentId,
      table.apiOperationId,
      table.consumerId,
      table.behaviorDefinitionId,
    ),
    foreignKey({
      name: "behavior_observations_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_observations_operation_fk",
      columns: [table.organizationId, table.apiOperationId],
      foreignColumns: [apiOperations.organizationId, apiOperations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_observations_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "behavior_observations_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    index("behavior_observations_behavior_consumer_time_idx").on(
      table.organizationId,
      table.behaviorDefinitionId,
      table.consumerId,
      table.bucketStart,
    ),
    index("behavior_observations_operation_time_idx").on(
      table.organizationId,
      table.apiOperationId,
      table.bucketStart,
    ),
    check(
      "behavior_observations_counts_ck",
      sql`${table.observationCount} > 0 and ${table.sessionCount} > 0`,
    ),
  ],
);
