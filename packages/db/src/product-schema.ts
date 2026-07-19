import { gt, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  agents,
  assertionReplayOutcome,
  assertionStatus,
  behaviorKind,
  claimState,
  evidenceTier,
  organizations,
  replayOutcome,
  timestamps,
} from "./schema";

export const apiSpecs = pgTable(
  "api_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    objectKey: text("object_key").notNull(),
    digest: text("digest").notNull(),
    normalized: jsonb("normalized").notNull().default({}),
    active: boolean("active").notNull().default(false),
    uploadedBy: text("uploaded_by").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("api_specs_org_version_unique").on(table.organizationId, table.version),
    index("api_specs_org_active_idx").on(table.organizationId, table.active),
  ],
);

export const operations = pgTable(
  "operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiSpecId: uuid("api_spec_id").references(() => apiSpecs.id, { onDelete: "set null" }),
    method: text("method").notNull(),
    pathTemplate: text("path_template").notNull(),
    operationId: text("operation_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operations_org_method_path_unique").on(
      table.organizationId,
      table.method,
      table.pathTemplate,
    ),
    index("operations_org_idx").on(table.organizationId),
  ],
);

export const consumers = pgTable(
  "consumers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stableId: text("stable_id").notNull(),
    displayAlias: text("display_alias").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consumers_org_stable_unique").on(table.organizationId, table.stableId),
    index("consumers_org_last_seen_idx").on(table.organizationId, table.lastSeenAt),
  ],
);

export const captureBatches = pgTable(
  "capture_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    batchId: text("batch_id").notNull(),
    response: jsonb("response").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("capture_batches_org_agent_batch_unique").on(
      table.organizationId,
      table.agentId,
      table.batchId,
    ),
  ],
);

export const captureSessions = pgTable(
  "capture_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => consumers.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    sessionComplete: boolean("session_complete").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("capture_sessions_org_consumer_session_unique").on(
      table.organizationId,
      table.consumerId,
      table.sessionId,
    ),
    index("capture_sessions_org_started_idx").on(table.organizationId, table.startedAt),
  ],
);

export const behaviorDefinitions = pgTable(
  "behavior_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fingerprintDigest: text("fingerprint_digest").notNull(),
    kind: behaviorKind("kind").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    fingerprint: jsonb("fingerprint").notNull(),
    declared: boolean("declared").notNull().default(false),
    label: text("label"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("behavior_definitions_org_id_unique").on(table.organizationId, table.id),
    uniqueIndex("behavior_definitions_org_digest_unique").on(
      table.organizationId,
      table.fingerprintDigest,
    ),
    index("behavior_definitions_org_kind_idx").on(table.organizationId, table.kind),
  ],
);

export const behaviorObservations = pgTable(
  "behavior_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id, { onDelete: "cascade" }),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => consumers.id, { onDelete: "cascade" }),
    behaviorId: uuid("behavior_id")
      .notNull()
      .references(() => behaviorDefinitions.id, { onDelete: "cascade" }),
    captureSessionId: uuid("capture_session_id").references(() => captureSessions.id, {
      onDelete: "set null",
    }),
    eventId: text("event_id").notNull(),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("behavior_observations_org_event_behavior_unique").on(
      table.organizationId,
      table.eventId,
      table.behaviorId,
    ),
    index("behavior_observations_org_behavior_idx").on(table.organizationId, table.behaviorId),
    index("behavior_observations_org_consumer_idx").on(table.organizationId, table.consumerId),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    behaviorId: uuid("behavior_id").references(() => behaviorDefinitions.id, {
      onDelete: "set null",
    }),
    consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "set null" }),
    operationId: uuid("operation_id").references(() => operations.id, { onDelete: "set null" }),
    captureSessionId: uuid("capture_session_id").references(() => captureSessions.id, {
      onDelete: "set null",
    }),
    objectKey: text("object_key"),
    digest: text("digest").notNull(),
    redactionVersion: text("redaction_version").notNull(),
    sequenceStart: integer("sequence_start").notNull(),
    sequenceEnd: integer("sequence_end").notNull(),
    excerpt: jsonb("excerpt").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("receipts_org_behavior_idx").on(table.organizationId, table.behaviorId),
    index("receipts_org_expires_idx").on(table.organizationId, table.expiresAt),
  ],
);

export function receiptIsUnexpired(now = new Date()) {
  return gt(receipts.expiresAt, now);
}

export const dependencyClaims = pgTable(
  "dependency_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    behaviorId: uuid("behavior_id")
      .notNull()
      .references(() => behaviorDefinitions.id, { onDelete: "cascade" }),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => consumers.id, { onDelete: "cascade" }),
    tier: evidenceTier("tier").notNull(),
    state: claimState("state").notNull().default("active"),
    confidence: integer("confidence").notNull().default(0),
    evidence: jsonb("evidence").notNull().default({}),
    receiptId: uuid("receipt_id").references(() => receipts.id, { onDelete: "set null" }),
    humanOverrideTier: evidenceTier("human_override_tier"),
    overriddenBy: text("overridden_by"),
    overrideReason: text("override_reason"),
    overriddenAt: timestamp("overridden_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("dependency_claims_org_id_behavior_unique").on(
      table.organizationId,
      table.id,
      table.behaviorId,
    ),
    uniqueIndex("dependency_claims_org_behavior_consumer_unique").on(
      table.organizationId,
      table.behaviorId,
      table.consumerId,
    ),
    index("dependency_claims_org_tier_idx").on(table.organizationId, table.tier),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => dependencyClaims.id, { onDelete: "cascade" }),
    behaviorId: uuid("behavior_id")
      .notNull()
      .references(() => behaviorDefinitions.id, { onDelete: "cascade" }),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => consumers.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").references(() => operations.id, { onDelete: "set null" }),
    tier: evidenceTier("tier").notNull(),
    state: claimState("state").notNull().default("active"),
    title: text("title").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    freshnessUntil: timestamp("freshness_until", { withTimezone: true }).notNull(),
    receiptId: uuid("receipt_id").references(() => receipts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ledger_entries_org_claim_unique").on(table.organizationId, table.claimId),
    index("ledger_entries_org_seen_idx").on(table.organizationId, table.lastSeenAt),
    index("ledger_entries_org_tier_idx").on(table.organizationId, table.tier),
  ],
);

export const assertions = pgTable(
  "assertions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    behaviorId: uuid("behavior_id").notNull(),
    claimId: uuid("claim_id"),
    ownerId: text("owner_id").notNull(),
    reason: text("reason").notNull(),
    policy: jsonb("policy").notNull().default({}),
    status: assertionStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolutionType: text("resolution_type"),
    resolutionReason: text("resolution_reason"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    customerNotice: jsonb("customer_notice"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "assertions_org_behavior_fk",
      columns: [table.organizationId, table.behaviorId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "assertions_org_claim_behavior_fk",
      columns: [table.organizationId, table.claimId, table.behaviorId],
      foreignColumns: [
        dependencyClaims.organizationId,
        dependencyClaims.id,
        dependencyClaims.behaviorId,
      ],
    }).onDelete("restrict"),
    index("assertions_org_expires_idx").on(table.organizationId, table.status, table.expiresAt),
    index("assertions_org_behavior_idx").on(table.organizationId, table.behaviorId),
    check(
      "assertions_resolution_type_valid",
      sql`${table.resolutionType} IS NULL OR ${table.resolutionType} IN ('documented', 'extended', 'scheduled_break')`,
    ),
  ],
);

export const replayCorpora = pgTable(
  "replay_corpora",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    digest: text("digest").notNull(),
    objectKey: text("object_key").notNull(),
    fixtureDigest: text("fixture_digest"),
    fixtureObjectKey: text("fixture_object_key"),
    stubsObjectKey: text("stubs_object_key"),
    curationStatus: text("curation_status").notNull().default("draft"),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("replay_corpora_org_digest_unique").on(table.organizationId, table.digest),
    check(
      "replay_corpora_curation_status_valid",
      sql`${table.curationStatus} IN ('draft', 'ready', 'archived')`,
    ),
  ],
);

export const corpusItems = pgTable(
  "corpus_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    corpusId: uuid("corpus_id")
      .notNull()
      .references(() => replayCorpora.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull(),
    operationId: uuid("operation_id").references(() => operations.id, { onDelete: "set null" }),
    consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "set null" }),
    coverageClass: text("coverage_class").notNull(),
    objectKey: text("object_key").notNull(),
    digest: text("digest").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    requestMetadata: jsonb("request_metadata").notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("corpus_items_org_corpus_case_unique").on(
      table.organizationId,
      table.corpusId,
      table.caseId,
    ),
    index("corpus_items_org_coverage_idx").on(table.organizationId, table.coverageClass),
    check("corpus_items_priority_positive", sql`${table.priority} > 0`),
  ],
);

export const gatePolicies = pgTable(
  "gate_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    blockTiers: text("block_tiers").array().notNull().default(sql`ARRAY['T1']::text[]`),
    warnTiers: text("warn_tiers").array().notNull().default(sql`ARRAY['T2']::text[]`),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check(
      "gate_policies_block_tiers_t1_only",
      sql`${table.blockTiers} <@ ARRAY['T1']::text[] AND cardinality(${table.blockTiers}) <= 1`,
    ),
    check("gate_policies_outcomes_disjoint", sql`NOT (${table.blockTiers} && ${table.warnTiers})`),
    uniqueIndex("gate_policies_org_version_unique").on(table.organizationId, table.version),
    index("gate_policies_org_active_idx").on(table.organizationId, table.active),
  ],
);

export const replayRuns = pgTable(
  "replay_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reportVersion: text("report_version").notNull(),
    baseUrl: text("base_url").notNull(),
    candidateUrl: text("candidate_url").notNull(),
    baseImageDigest: text("base_image_digest").notNull(),
    candidateImageDigest: text("candidate_image_digest").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    corpusDigest: text("corpus_digest").notNull(),
    fixtureDigest: text("fixture_digest").notNull(),
    maskDigest: text("mask_digest").notNull(),
    runnerVersion: text("runner_version").notNull(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => gatePolicies.id, { onDelete: "restrict" }),
    policyVersion: integer("policy_version").notNull(),
    runs: integer("runs").notNull(),
    outcome: replayOutcome("outcome").notNull(),
    reportDigest: text("report_digest").notNull(),
    signatureKeyId: text("signature_key_id").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("replay_runs_org_report_digest_unique").on(
      table.organizationId,
      table.reportDigest,
    ),
    index("replay_runs_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const replayDeltas = pgTable(
  "replay_deltas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    replayRunId: uuid("replay_run_id")
      .notNull()
      .references(() => replayRuns.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull(),
    kind: behaviorKind("kind").notNull(),
    path: text("path").notNull(),
    digest: text("digest").notNull(),
    stable: boolean("stable").notNull(),
    quarantined: boolean("quarantined").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    matches: jsonb("matches").notNull().default([]),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("replay_deltas_org_run_case_delta_unique").on(
      table.organizationId,
      table.replayRunId,
      table.caseId,
      table.kind,
      table.path,
      table.digest,
    ),
    index("replay_deltas_org_run_idx").on(table.organizationId, table.replayRunId),
    index("replay_deltas_org_digest_idx").on(table.organizationId, table.digest),
  ],
);

export const replayAssertionResults = pgTable(
  "replay_assertion_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    replayRunId: uuid("replay_run_id")
      .notNull()
      .references(() => replayRuns.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id")
      .notNull()
      .references(() => assertions.id, { onDelete: "restrict" }),
    behaviorId: uuid("behavior_id").notNull(),
    claimId: uuid("claim_id"),
    caseId: text("case_id").notNull(),
    outcome: assertionReplayOutcome("outcome").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("replay_assertion_results_org_run_assertion_unique").on(
      table.organizationId,
      table.replayRunId,
      table.assertionId,
    ),
    index("replay_assertion_results_org_run_idx").on(table.organizationId, table.replayRunId),
  ],
);

export const gateDecisions = pgTable(
  "gate_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    replayRunId: uuid("replay_run_id")
      .notNull()
      .references(() => replayRuns.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id").references(() => gatePolicies.id, { onDelete: "set null" }),
    outcome: replayOutcome("outcome").notNull(),
    blockCount: integer("block_count").notNull(),
    warnCount: integer("warn_count").notNull(),
    noteCount: integer("note_count").notNull(),
    reasons: jsonb("reasons").notNull().default([]),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("gate_decisions_org_run_unique").on(table.organizationId, table.replayRunId),
  ],
);
