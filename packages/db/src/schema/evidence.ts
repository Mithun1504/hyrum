import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { llmRuns } from "./ai-core";
import { behaviorDefinitions } from "./behaviors";
import { captureSessions, consumers } from "./capture";
import { redactionPolicyVersions } from "./configuration";
import { memberships, organizationKeyVersions, organizations } from "./identity";
import { apiServices, extractorReleases, serviceEnvironments } from "./services";
import { createdAt, mutableTimestamps, tsvector, uuidPrimaryKey } from "./shared/columns";
import {
  claimProposer,
  claimStatus,
  evidenceRole,
  evidenceTier,
  freshnessStatus,
  objectAvailability,
  receiptType,
  reviewState,
  sessionCompleteness,
} from "./shared/enums";
import { storedObjects } from "./storage";

export const receipts = pgTable(
  "receipts",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    captureSessionId: uuid("capture_session_id").notNull(),
    storedObjectId: uuid("stored_object_id").notNull(),
    receiptType: receiptType("receipt_type").notNull(),
    bundleDigest: text("bundle_digest").notNull(),
    redactionPolicyVersionId: uuid("redaction_policy_version_id").notNull(),
    extractorReleaseId: uuid("extractor_release_id")
      .notNull()
      .references(() => extractorReleases.id, { onDelete: "restrict" }),
    sequenceStart: bigint("sequence_start", { mode: "bigint" }).notNull(),
    sequenceEnd: bigint("sequence_end", { mode: "bigint" }).notNull(),
    completeness: sessionCompleteness("completeness").notNull(),
    approvedExcerpt: text("approved_excerpt"),
    availabilityStatus: objectAvailability("availability_status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("receipts_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("receipts_bundle_digest_uq").on(table.organizationId, table.bundleDigest),
    foreignKey({
      name: "receipts_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "receipts_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "receipts_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "receipts_session_fk",
      columns: [table.organizationId, table.captureSessionId],
      foreignColumns: [captureSessions.organizationId, captureSessions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "receipts_object_fk",
      columns: [table.organizationId, table.storedObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipts_redaction_policy_fk",
      columns: [table.organizationId, table.redactionPolicyVersionId],
      foreignColumns: [redactionPolicyVersions.organizationId, redactionPolicyVersions.id],
    }).onDelete("restrict"),
    index("receipts_claim_lookup_idx").on(
      table.organizationId,
      table.consumerId,
      table.receiptType,
      table.createdAt,
    ),
    index("receipts_expiry_idx").on(table.organizationId, table.expiresAt),
    check("receipts_sequence_ck", sql`${table.sequenceEnd} >= ${table.sequenceStart}`),
    check(
      "receipts_excerpt_length_ck",
      sql`${table.approvedExcerpt} is null or length(${table.approvedExcerpt}) <= 4000`,
    ),
  ],
);

export const dependencyClaims = pgTable(
  "dependency_claims",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    tier: evidenceTier("tier").notNull(),
    status: claimStatus("status").notNull().default("proposed"),
    ruleVersion: text("rule_version").notNull(),
    deterministicEligible: boolean("deterministic_eligible").notNull().default(false),
    supportCount: bigint("support_count", { mode: "bigint" }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    supersedesClaimId: uuid("supersedes_claim_id"),
    proposedBy: claimProposer("proposed_by").notNull(),
    llmRunId: uuid("llm_run_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("dependency_claims_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("dependency_claims_active_uq")
      .on(table.behaviorDefinitionId, table.consumerId)
      .where(sql`${table.status} = 'active' and ${table.effectiveUntil} is null`),
    foreignKey({
      name: "dependency_claims_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "dependency_claims_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "dependency_claims_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "dependency_claims_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "dependency_claims_supersedes_fk",
      columns: [table.organizationId, table.supersedesClaimId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "dependency_claims_llm_run_fk",
      columns: [table.organizationId, table.llmRunId],
      foreignColumns: [llmRuns.organizationId, llmRuns.id],
    }).onDelete("restrict"),
    index("dependency_claims_consumer_tier_idx").on(
      table.organizationId,
      table.consumerId,
      table.tier,
      table.status,
    ),
    check("dependency_claims_support_ck", sql`${table.supportCount} >= 0`),
    check(
      "dependency_claims_t1_eligibility_ck",
      sql`${table.tier} <> 't1' or ${table.deterministicEligible}`,
    ),
    check(
      "dependency_claims_confidence_tier_ck",
      sql`${table.tier} = 't2' or ${table.confidence} is null`,
    ),
    check(
      "dependency_claims_confidence_ck",
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
  ],
);

export const claimEvidence = pgTable(
  "claim_evidence",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    dependencyClaimId: uuid("dependency_claim_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    evidenceRole: evidenceRole("evidence_role").notNull(),
    responseSequenceNo: bigint("response_sequence_no", { mode: "bigint" }),
    requestSequenceNo: bigint("request_sequence_no", { mode: "bigint" }),
    responseJsonPath: text("response_json_path"),
    requestJsonPath: text("request_json_path"),
    valueHmac: text("value_hmac"),
    structuralHmacKeyVersionId: uuid("structural_hmac_key_version_id"),
    patternMetrics: jsonb("pattern_metrics"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("claim_evidence_org_id_uq").on(table.organizationId, table.id),
    unique("claim_evidence_location_uq")
      .on(
        table.dependencyClaimId,
        table.receiptId,
        table.evidenceRole,
        table.responseSequenceNo,
        table.requestSequenceNo,
        table.responseJsonPath,
        table.requestJsonPath,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "claim_evidence_claim_fk",
      columns: [table.organizationId, table.dependencyClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "claim_evidence_receipt_fk",
      columns: [table.organizationId, table.receiptId],
      foreignColumns: [receipts.organizationId, receipts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "claim_evidence_structural_key_fk",
      columns: [table.organizationId, table.structuralHmacKeyVersionId],
      foreignColumns: [organizationKeyVersions.organizationId, organizationKeyVersions.id],
    }).onDelete("restrict"),
    check(
      "claim_evidence_sequence_ck",
      sql`${table.requestSequenceNo} is null or ${table.responseSequenceNo} is null or ${table.requestSequenceNo} > ${table.responseSequenceNo}`,
    ),
  ],
);

export const claimReviewDecisions = pgTable(
  "claim_review_decisions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    dependencyClaimId: uuid("dependency_claim_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    decision: reviewState("decision").notNull(),
    fromTier: evidenceTier("from_tier"),
    toTier: evidenceTier("to_tier"),
    reason: text("reason").notNull(),
    recentAuthAt: timestamp("recent_auth_at", { withTimezone: true }).notNull(),
    supersedesDecisionId: uuid("supersedes_decision_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("claim_review_decisions_org_id_uq").on(table.organizationId, table.id),
    foreignKey({
      name: "claim_review_decisions_claim_fk",
      columns: [table.organizationId, table.dependencyClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "claim_review_decisions_membership_fk",
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "claim_review_decisions_supersedes_fk",
      columns: [table.organizationId, table.supersedesDecisionId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    index("claim_review_decisions_claim_time_idx").on(table.dependencyClaimId, table.createdAt),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    dependencyClaimId: uuid("dependency_claim_id").notNull(),
    ownerMembershipId: uuid("owner_membership_id"),
    reviewState: reviewState("review_state").notNull().default("unreviewed"),
    freshnessStatus: freshnessStatus("freshness_status").notNull().default("fresh"),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }).notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
    staleAt: timestamp("stale_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    searchDocument: tsvector("search_document"),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("ledger_entries_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("ledger_entries_claim_uq").on(table.dependencyClaimId),
    foreignKey({
      name: "ledger_entries_claim_fk",
      columns: [table.organizationId, table.dependencyClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ledger_entries_owner_fk",
      columns: [table.organizationId, table.ownerMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    index("ledger_entries_filters_idx").on(
      table.organizationId,
      table.freshnessStatus,
      table.reviewState,
      table.lastObservedAt,
    ),
    index("ledger_entries_search_idx").using("gin", table.searchDocument),
  ],
);
