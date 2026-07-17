import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { llmRuns } from "./ai-core";
import { assertions, breakingChangePlans } from "./assertions";
import { behaviorClusters, behaviorDefinitions } from "./behaviors";
import { dependencyClaims, receipts } from "./evidence";
import { gateDecisions } from "./gates";
import { memberships, organizations } from "./identity";
import { replayDeltas, replayRuns } from "./replay";
import { apiServices } from "./services";
import { createdAt, uuidPrimaryKey } from "./shared/columns";
import { draftStatus, draftType } from "./shared/enums";
import { storedObjects } from "./storage";

export const generatedDrafts = pgTable(
  "generated_drafts",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    draftType: draftType("draft_type").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id"),
    behaviorClusterId: uuid("behavior_cluster_id"),
    assertionId: uuid("assertion_id"),
    breakingChangePlanId: uuid("breaking_change_plan_id"),
    replayRunId: uuid("replay_run_id"),
    gateDecisionId: uuid("gate_decision_id"),
    llmRunId: uuid("llm_run_id").notNull(),
    contentObjectId: uuid("content_object_id"),
    contentExcerpt: text("content_excerpt").notNull(),
    status: draftStatus("status").notNull().default("draft"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("generated_drafts_org_id_uq").on(table.organizationId, table.id),
    foreignKey({
      name: "generated_drafts_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "generated_drafts_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_cluster_fk",
      columns: [table.organizationId, table.behaviorClusterId],
      foreignColumns: [behaviorClusters.organizationId, behaviorClusters.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_break_plan_fk",
      columns: [table.organizationId, table.breakingChangePlanId],
      foreignColumns: [breakingChangePlans.organizationId, breakingChangePlans.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_replay_run_fk",
      columns: [table.organizationId, table.replayRunId],
      foreignColumns: [replayRuns.organizationId, replayRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_gate_decision_fk",
      columns: [table.organizationId, table.gateDecisionId],
      foreignColumns: [gateDecisions.organizationId, gateDecisions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_llm_run_fk",
      columns: [table.organizationId, table.llmRunId],
      foreignColumns: [llmRuns.organizationId, llmRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_content_object_fk",
      columns: [table.organizationId, table.contentObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "generated_drafts_reviewer_fk",
      columns: [table.organizationId, table.reviewedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    index("generated_drafts_subject_idx").on(
      table.organizationId,
      table.apiServiceId,
      table.draftType,
    ),
    check("generated_drafts_excerpt_ck", sql`length(${table.contentExcerpt}) <= 8000`),
  ],
);

export const llmCitations = pgTable(
  "llm_citations",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    llmRunId: uuid("llm_run_id").notNull(),
    receiptId: uuid("receipt_id"),
    dependencyClaimId: uuid("dependency_claim_id"),
    replayDeltaId: uuid("replay_delta_id"),
    behaviorDefinitionId: uuid("behavior_definition_id"),
    responseSequenceNo: bigint("response_sequence_no", { mode: "bigint" }),
    requestSequenceNo: bigint("request_sequence_no", { mode: "bigint" }),
    responseJsonPath: text("response_json_path"),
    requestJsonPath: text("request_json_path"),
    citationRole: text("citation_role").notNull(),
    validated: boolean("validated").notNull().default(false),
    validationErrorCode: text("validation_error_code"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("llm_citations_org_id_uq").on(table.organizationId, table.id),
    foreignKey({
      name: "llm_citations_run_fk",
      columns: [table.organizationId, table.llmRunId],
      foreignColumns: [llmRuns.organizationId, llmRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "llm_citations_receipt_fk",
      columns: [table.organizationId, table.receiptId],
      foreignColumns: [receipts.organizationId, receipts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "llm_citations_claim_fk",
      columns: [table.organizationId, table.dependencyClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "llm_citations_delta_fk",
      columns: [table.organizationId, table.replayDeltaId],
      foreignColumns: [replayDeltas.organizationId, replayDeltas.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "llm_citations_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("restrict"),
    check(
      "llm_citations_exactly_one_resource_ck",
      sql`num_nonnulls(${table.receiptId}, ${table.dependencyClaimId}, ${table.replayDeltaId}, ${table.behaviorDefinitionId}) = 1`,
    ),
  ],
);
