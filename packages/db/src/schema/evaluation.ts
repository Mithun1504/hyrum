import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { promptVersions } from "./ai-core";
import { organizations } from "./identity";
import { apiServices, extractorReleases } from "./services";
import { createdAt, mutableTimestamps, uuidPrimaryKey } from "./shared/columns";
import {
  behaviorKind,
  evaluationMetricName,
  evaluationScope,
  evaluationStatus,
  evidenceTier,
} from "./shared/enums";
import { storedObjects } from "./storage";

export const evaluationDatasets = pgTable(
  "evaluation_datasets",
  {
    id: uuidPrimaryKey(),
    scope: evaluationScope("scope").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    storedObjectId: uuid("stored_object_id"),
    repositoryPath: text("repository_path"),
    datasetDigest: text("dataset_digest").notNull(),
    labelSchemaVersion: integer("label_schema_version").notNull(),
    exampleCount: integer("example_count").notNull(),
    status: text("status").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("evaluation_datasets_scope_owner_name_version_uq").on(
      table.scope,
      sql`coalesce(${table.organizationId}::text, '__global__')`,
      table.name,
      table.version,
    ),
    foreignKey({
      name: "evaluation_datasets_object_fk",
      columns: [table.organizationId, table.storedObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    check(
      "evaluation_datasets_scope_ck",
      sql`(${table.scope} = 'global' and ${table.organizationId} is null and ${table.repositoryPath} is not null and ${table.storedObjectId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null and ${table.repositoryPath} is null and ${table.storedObjectId} is not null)`,
    ),
    check(
      "evaluation_datasets_storage_ck",
      sql`num_nonnulls(${table.storedObjectId}, ${table.repositoryPath}) = 1`,
    ),
    check(
      "evaluation_datasets_counts_ck",
      sql`${table.version} > 0 and ${table.exampleCount} >= 0`,
    ),
  ],
);

export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: uuidPrimaryKey(),
    scope: evaluationScope("scope").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    apiServiceId: uuid("api_service_id"),
    evaluationDatasetId: uuid("evaluation_dataset_id")
      .notNull()
      .references(() => evaluationDatasets.id, { onDelete: "restrict" }),
    evaluationType: text("evaluation_type").notNull(),
    extractorReleaseId: uuid("extractor_release_id")
      .notNull()
      .references(() => extractorReleases.id, { onDelete: "restrict" }),
    promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id, {
      onDelete: "restrict",
    }),
    ruleVersion: text("rule_version").notNull(),
    configDigest: text("config_digest").notNull(),
    status: evaluationStatus("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    resultObjectId: uuid("result_object_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("evaluation_runs_org_id_uq")
      .on(table.organizationId, table.id)
      .where(sql`${table.organizationId} is not null`),
    foreignKey({
      name: "evaluation_runs_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("set null"),
    foreignKey({
      name: "evaluation_runs_result_object_fk",
      columns: [table.organizationId, table.resultObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    index("evaluation_runs_status_idx").on(table.scope, table.status, table.createdAt),
    check(
      "evaluation_runs_scope_ck",
      sql`(${table.scope} = 'global' and ${table.organizationId} is null and ${table.apiServiceId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null)`,
    ),
  ],
);

export const evaluationMetrics = pgTable(
  "evaluation_metrics",
  {
    id: uuidPrimaryKey(),
    scope: evaluationScope("scope").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    evaluationRunId: uuid("evaluation_run_id")
      .notNull()
      .references(() => evaluationRuns.id, { onDelete: "cascade" }),
    metricName: evaluationMetricName("metric_name").notNull(),
    behaviorKind: behaviorKind("behavior_kind"),
    evidenceTier: evidenceTier("evidence_tier"),
    value: numeric("value").notNull(),
    sampleCount: integer("sample_count").notNull(),
    threshold: numeric("threshold"),
    passed: boolean("passed"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("evaluation_metrics_all_dimensions_uq")
      .on(table.evaluationRunId, table.metricName, table.behaviorKind, table.evidenceTier)
      .where(sql`${table.behaviorKind} is not null and ${table.evidenceTier} is not null`),
    uniqueIndex("evaluation_metrics_behavior_dimension_uq")
      .on(table.evaluationRunId, table.metricName, table.behaviorKind)
      .where(sql`${table.behaviorKind} is not null and ${table.evidenceTier} is null`),
    uniqueIndex("evaluation_metrics_tier_dimension_uq")
      .on(table.evaluationRunId, table.metricName, table.evidenceTier)
      .where(sql`${table.behaviorKind} is null and ${table.evidenceTier} is not null`),
    uniqueIndex("evaluation_metrics_unscoped_uq")
      .on(table.evaluationRunId, table.metricName)
      .where(sql`${table.behaviorKind} is null and ${table.evidenceTier} is null`),
    index("evaluation_metrics_name_idx").on(table.metricName, table.createdAt),
    check("evaluation_metrics_sample_count_ck", sql`${table.sampleCount} >= 0`),
    check(
      "evaluation_metrics_scope_ck",
      sql`(${table.scope} = 'global' and ${table.organizationId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null)`,
    ),
  ],
);

export const usageRollups = pgTable(
  "usage_rollups",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    day: date("day").notNull(),
    apiServiceId: uuid("api_service_id"),
    serviceScopeKey: uuid("service_scope_key")
      .notNull()
      .generatedAlwaysAs(
        sql`coalesce(api_service_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      ),
    ingestedSessions: bigint("ingested_sessions", { mode: "bigint" }).notNull().default(sql`0`),
    observedRequestsEstimate: bigint("observed_requests_estimate", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    storedBytes: bigint("stored_bytes", { mode: "bigint" }).notNull().default(sql`0`),
    replayRequests: bigint("replay_requests", { mode: "bigint" }).notNull().default(sql`0`),
    llmInputTokens: bigint("llm_input_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    llmOutputTokens: bigint("llm_output_tokens", { mode: "bigint" }).notNull().default(sql`0`),
    llmCostMicrounits: bigint("llm_cost_microunits", { mode: "bigint" }).notNull().default(sql`0`),
    jobFailures: integer("job_failures").notNull().default(0),
    ...mutableTimestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.day, table.serviceScopeKey] }),
    foreignKey({
      name: "usage_rollups_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    check(
      "usage_rollups_nonnegative_ck",
      sql`${table.ingestedSessions} >= 0 and ${table.observedRequestsEstimate} >= 0 and ${table.storedBytes} >= 0 and ${table.replayRequests} >= 0 and ${table.llmInputTokens} >= 0 and ${table.llmOutputTokens} >= 0 and ${table.llmCostMicrounits} >= 0 and ${table.jobFailures} >= 0`,
    ),
  ],
);
