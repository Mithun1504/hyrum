import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { assertions, breakingChangePlans } from "./assertions";
import { behaviorDefinitions } from "./behaviors";
import { consumers } from "./capture";
import { dependencyClaims, receipts } from "./evidence";
import { gatePolicyVersions } from "./gate-policies";
import { githubRepositories, pullRequests } from "./github-core";
import { memberships, organizations } from "./identity";
import { replayDeltas, replayRuns } from "./replay";
import { apiServices } from "./services";
import { createdAt, uuidPrimaryKey } from "./shared/columns";
import { evidenceTier, gateExceptionStatus, gateOutcome } from "./shared/enums";

export const gateExceptions = pgTable(
  "gate_exceptions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    breakingChangePlanId: uuid("breaking_change_plan_id").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    githubRepositoryId: uuid("github_repository_id"),
    pullRequestId: uuid("pull_request_id"),
    candidateImageDigest: text("candidate_image_digest").notNull(),
    status: gateExceptionStatus("status").notNull().default("pending"),
    reason: text("reason").notNull(),
    requestedByMembershipId: uuid("requested_by_membership_id").notNull(),
    approvedByMembershipId: uuid("approved_by_membership_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    recentAuthAt: timestamp("recent_auth_at", { withTimezone: true }),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("gate_exceptions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("gate_exceptions_active_exact_uq")
      .on(table.breakingChangePlanId, table.behaviorDefinitionId, table.candidateImageDigest)
      .where(sql`${table.status} in ('pending', 'approved')`),
    foreignKey({
      name: "gate_exceptions_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_exceptions_plan_fk",
      columns: [table.organizationId, table.breakingChangePlanId],
      foreignColumns: [breakingChangePlans.organizationId, breakingChangePlans.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_exceptions_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_exceptions_repository_fk",
      columns: [table.organizationId, table.githubRepositoryId],
      foreignColumns: [githubRepositories.organizationId, githubRepositories.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gate_exceptions_pull_request_fk",
      columns: [table.organizationId, table.pullRequestId],
      foreignColumns: [pullRequests.organizationId, pullRequests.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gate_exceptions_requester_fk",
      columns: [table.organizationId, table.requestedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gate_exceptions_approver_fk",
      columns: [table.organizationId, table.approvedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    index("gate_exceptions_validity_idx").on(table.organizationId, table.status, table.validUntil),
    check("gate_exceptions_reason_ck", sql`length(trim(${table.reason})) > 0`),
    check("gate_exceptions_window_ck", sql`${table.validUntil} > ${table.validFrom}`),
  ],
);

export const gateDecisions = pgTable(
  "gate_decisions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replayRunId: uuid("replay_run_id").notNull(),
    gatePolicyVersionId: uuid("gate_policy_version_id").notNull(),
    outcome: gateOutcome("outcome").notNull(),
    decisionEngineVersion: text("decision_engine_version").notNull(),
    decisionDigest: text("decision_digest").notNull(),
    blockingImpactCount: integer("blocking_impact_count").notNull().default(0),
    warningImpactCount: integer("warning_impact_count").notNull().default(0),
    notedImpactCount: integer("noted_impact_count").notNull().default(0),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("gate_decisions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("gate_decisions_replay_run_uq").on(table.replayRunId),
    uniqueIndex("gate_decisions_digest_uq").on(table.organizationId, table.decisionDigest),
    foreignKey({
      name: "gate_decisions_run_fk",
      columns: [table.organizationId, table.replayRunId],
      foreignColumns: [replayRuns.organizationId, replayRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_decisions_policy_version_fk",
      columns: [table.organizationId, table.gatePolicyVersionId],
      foreignColumns: [gatePolicyVersions.organizationId, gatePolicyVersions.id],
    }).onDelete("restrict"),
    check(
      "gate_decisions_counts_ck",
      sql`${table.blockingImpactCount} >= 0 and ${table.warningImpactCount} >= 0 and ${table.notedImpactCount} >= 0`,
    ),
  ],
);

export const gateImpacts = pgTable(
  "gate_impacts",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    gateDecisionId: uuid("gate_decision_id").notNull(),
    replayDeltaId: uuid("replay_delta_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    dependencyClaimId: uuid("dependency_claim_id"),
    assertionId: uuid("assertion_id"),
    effectiveTier: evidenceTier("effective_tier"),
    action: gateOutcome("action").notNull(),
    gateExceptionId: uuid("gate_exception_id"),
    receiptId: uuid("receipt_id"),
    reasonCode: text("reason_code").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("gate_impacts_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("gate_impacts_claim_target_uq")
      .on(table.gateDecisionId, table.replayDeltaId, table.consumerId, table.dependencyClaimId)
      .where(sql`${table.dependencyClaimId} is not null`),
    uniqueIndex("gate_impacts_assertion_target_uq")
      .on(table.gateDecisionId, table.replayDeltaId, table.consumerId, table.assertionId)
      .where(sql`${table.assertionId} is not null`),
    uniqueIndex("gate_impacts_exception_single_use_uq")
      .on(table.gateExceptionId)
      .where(sql`${table.gateExceptionId} is not null`),
    foreignKey({
      name: "gate_impacts_decision_fk",
      columns: [table.organizationId, table.gateDecisionId],
      foreignColumns: [gateDecisions.organizationId, gateDecisions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_impacts_delta_fk",
      columns: [table.organizationId, table.replayDeltaId],
      foreignColumns: [replayDeltas.organizationId, replayDeltas.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_impacts_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gate_impacts_claim_fk",
      columns: [table.organizationId, table.dependencyClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gate_impacts_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gate_impacts_exception_fk",
      columns: [table.organizationId, table.gateExceptionId],
      foreignColumns: [gateExceptions.organizationId, gateExceptions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gate_impacts_receipt_fk",
      columns: [table.organizationId, table.receiptId],
      foreignColumns: [receipts.organizationId, receipts.id],
    }).onDelete("restrict"),
    check(
      "gate_impacts_exactly_one_target_ck",
      sql`num_nonnulls(${table.dependencyClaimId}, ${table.assertionId}) = 1`,
    ),
    check(
      "gate_impacts_tier_target_ck",
      sql`(${table.assertionId} is not null and ${table.effectiveTier} is null) or (${table.dependencyClaimId} is not null and ${table.effectiveTier} is not null)`,
    ),
    check(
      "gate_impacts_t2_action_ck",
      sql`${table.effectiveTier} <> 't2' or ${table.action} in ('warn', 'note', 'pass')`,
    ),
    check(
      "gate_impacts_t3_action_ck",
      sql`${table.effectiveTier} <> 't3' or ${table.action} in ('note', 'pass')`,
    ),
  ],
);
