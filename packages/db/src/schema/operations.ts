import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./identity";
import { apiServices } from "./services";
import { mutableTimestamps, uuidPrimaryKey } from "./shared/columns";
import { jobStatus } from "./shared/enums";
import { storedObjects } from "./storage";

export const jobs = pgTable(
  "jobs",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    payloadObjectId: uuid("payload_object_id"),
    status: jobStatus("status").notNull().default("pending"),
    priority: smallint("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    concurrencyKey: text("concurrency_key"),
    lastErrorCode: text("last_error_code"),
    lastErrorSummary: text("last_error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("jobs_tenant_idempotency_uq").on(
      sql`coalesce(${table.organizationId}::text, '__platform__')`,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "jobs_payload_object_fk",
      columns: [table.organizationId, table.payloadObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    index("jobs_claim_idx").on(table.status, table.runAfter, table.priority, table.leaseExpiresAt),
    index("jobs_tenant_fairness_idx").on(
      table.organizationId,
      table.concurrencyKey,
      table.runAfter,
    ),
    check(
      "jobs_payload_source_ck",
      sql`num_nonnulls(${table.payload}, ${table.payloadObjectId}) = 1`,
    ),
    check(
      "jobs_payload_object_tenant_ck",
      sql`${table.payloadObjectId} is null or ${table.organizationId} is not null`,
    ),
    check("jobs_attempts_ck", sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`),
    check(
      "jobs_error_summary_length_ck",
      sql`${table.lastErrorSummary} is null or length(${table.lastErrorSummary}) <= 2000`,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    topic: text("topic").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventVersion: integer("event_version").notNull(),
    payload: jsonb("payload").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("outbox_events_aggregate_version_uq").on(
      sql`coalesce(${table.organizationId}::text, '__platform__')`,
      table.aggregateType,
      table.aggregateId,
      table.eventVersion,
    ),
    index("outbox_events_unpublished_idx")
      .on(table.availableAt, table.leaseExpiresAt)
      .where(sql`${table.publishedAt} is null`),
    check("outbox_events_version_ck", sql`${table.eventVersion} > 0`),
  ],
);

export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    apiServiceId: uuid("api_service_id"),
    taskType: text("task_type").notNull(),
    scheduleExpression: text("schedule_expression").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastEnqueuedAt: timestamp("last_enqueued_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    idempotencySeed: text("idempotency_seed").notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("scheduled_tasks_target_type_uq").on(
      sql`coalesce(${table.organizationId}::text, '__platform__')`,
      sql`coalesce(${table.apiServiceId}::text, '__all__')`,
      table.taskType,
    ),
    foreignKey({
      name: "scheduled_tasks_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    check(
      "scheduled_tasks_service_tenant_ck",
      sql`${table.apiServiceId} is null or ${table.organizationId} is not null`,
    ),
    index("scheduled_tasks_due_idx").on(table.enabled, table.nextRunAt),
  ],
);
