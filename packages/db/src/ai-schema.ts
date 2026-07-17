import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { organizations, timestamps } from "./schema";

export const llmRuns = pgTable(
  "llm_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    responseId: text("response_id"),
    status: text("status").notNull(),
    inputDigest: text("input_digest").notNull(),
    resultDigest: text("result_digest").notNull(),
    tokenUsage: jsonb("token_usage"),
    result: jsonb("result").notNull(),
    ...timestamps,
  },
  (table) => [
    index("llm_runs_org_task_created_idx").on(table.organizationId, table.task, table.createdAt),
  ],
);
