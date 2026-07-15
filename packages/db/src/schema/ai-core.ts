import { sql } from "drizzle-orm";
import {
  bigint,
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
import { organizations } from "./identity";
import { apiServices } from "./services";
import { createdAt, uuidPrimaryKey } from "./shared/columns";
import { llmRunStatus, promptStatus, validationResult } from "./shared/enums";

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuidPrimaryKey(),
    taskType: text("task_type").notNull(),
    version: integer("version").notNull(),
    modelFamily: text("model_family").notNull(),
    promptDigest: text("prompt_digest").notNull(),
    schemaDigest: text("schema_digest").notNull(),
    sourceRevision: text("source_revision").notNull(),
    status: promptStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("prompt_versions_task_version_uq").on(table.taskType, table.version),
    uniqueIndex("prompt_versions_active_uq")
      .on(table.taskType)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const llmRuns = pgTable(
  "llm_runs",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id"),
    taskType: text("task_type").notNull(),
    promptVersionId: uuid("prompt_version_id")
      .notNull()
      .references(() => promptVersions.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    modelSnapshot: text("model_snapshot").notNull(),
    reasoningEffort: text("reasoning_effort"),
    inputDigest: text("input_digest").notNull(),
    cacheKey: text("cache_key").notNull(),
    openaiResponseId: text("openai_response_id"),
    status: llmRunStatus("status").notNull().default("queued"),
    schemaValid: boolean("schema_valid"),
    deterministicValidationStatus: validationResult("deterministic_validation_status")
      .notNull()
      .default("pending"),
    outputDigest: text("output_digest"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostMicrounits: bigint("estimated_cost_microunits", { mode: "number" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    abstentionReason: text("abstention_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("llm_runs_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("llm_runs_successful_cache_uq")
      .on(table.organizationId, table.taskType, table.promptVersionId, table.cacheKey)
      .where(sql`${table.status} = 'succeeded'`),
    foreignKey({
      name: "llm_runs_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("set null"),
    index("llm_runs_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);
