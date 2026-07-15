import { sql } from "drizzle-orm";
import {
  bigint,
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
import { assertions } from "./assertions";
import { behaviorDefinitions } from "./behaviors";
import { consumers } from "./capture";
import { replayProfiles } from "./configuration";
import { dependencyClaims, receipts } from "./evidence";
import { gatePolicyVersions } from "./gate-policies";
import { githubRepositories, pullRequests } from "./github-core";
import { organizations } from "./identity";
import { apiServices, extractorReleases, serviceEnvironments } from "./services";
import { createdAt, mutableTimestamps, uuidPrimaryKey } from "./shared/columns";
import {
  actorType,
  behaviorKind,
  corpusStatus,
  coverageClass,
  deltaStability,
  replayStatus,
  replayTriggerType,
} from "./shared/enums";
import { apiOperations } from "./specifications";
import { storedObjects } from "./storage";

export const replayCorpora = pgTable(
  "replay_corpora",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    version: integer("version").notNull(),
    status: corpusStatus("status").notNull().default("building"),
    storedObjectId: uuid("stored_object_id").notNull(),
    corpusDigest: text("corpus_digest").notNull(),
    extractorReleaseId: uuid("extractor_release_id")
      .notNull()
      .references(() => extractorReleases.id, { onDelete: "restrict" }),
    selectionAlgorithmVersion: text("selection_algorithm_version").notNull(),
    sourceWindowStart: timestamp("source_window_start", { withTimezone: true }).notNull(),
    sourceWindowEnd: timestamp("source_window_end", { withTimezone: true }).notNull(),
    itemCount: integer("item_count").notNull(),
    operationCount: integer("operation_count").notNull(),
    consumerCount: integer("consumer_count").notNull(),
    assertionCount: integer("assertion_count").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    supersedesCorpusId: uuid("supersedes_corpus_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("replay_corpora_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("replay_corpora_environment_version_uq").on(table.environmentId, table.version),
    uniqueIndex("replay_corpora_digest_uq").on(table.organizationId, table.corpusDigest),
    foreignKey({
      name: "replay_corpora_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_corpora_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_corpora_object_fk",
      columns: [table.organizationId, table.storedObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_corpora_supersedes_fk",
      columns: [table.organizationId, table.supersedesCorpusId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    index("replay_corpora_expiry_idx").on(table.organizationId, table.expiresAt),
    check("replay_corpora_window_ck", sql`${table.sourceWindowEnd} > ${table.sourceWindowStart}`),
    check(
      "replay_corpora_counts_ck",
      sql`${table.itemCount} >= 0 and ${table.operationCount} >= 0 and ${table.consumerCount} >= 0 and ${table.assertionCount} >= 0`,
    ),
  ],
);

export const corpusItems = pgTable(
  "corpus_items",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replayCorpusId: uuid("replay_corpus_id").notNull(),
    apiOperationId: uuid("api_operation_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id"),
    assertionId: uuid("assertion_id"),
    coverageClass: coverageClass("coverage_class").notNull(),
    objectOffset: bigint("object_offset", { mode: "number" }).notNull(),
    requestDigest: text("request_digest").notNull(),
    method: text("method").notNull(),
    normalizedPath: text("normalized_path").notNull(),
    safeMethod: boolean("safe_method").notNull(),
    requiresFixture: boolean("requires_fixture").notNull().default(false),
    selectionReason: text("selection_reason").notNull(),
    priorityRank: integer("priority_rank").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("corpus_items_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("corpus_items_request_class_uq").on(
      table.replayCorpusId,
      table.requestDigest,
      table.coverageClass,
    ),
    foreignKey({
      name: "corpus_items_corpus_fk",
      columns: [table.organizationId, table.replayCorpusId],
      foreignColumns: [replayCorpora.organizationId, replayCorpora.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "corpus_items_operation_fk",
      columns: [table.organizationId, table.apiOperationId],
      foreignColumns: [apiOperations.organizationId, apiOperations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "corpus_items_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "corpus_items_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "corpus_items_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("restrict"),
    index("corpus_items_coverage_idx").on(
      table.replayCorpusId,
      table.apiOperationId,
      table.consumerId,
      table.coverageClass,
    ),
  ],
);

export const replayRuns = pgTable(
  "replay_runs",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    replayCorpusId: uuid("replay_corpus_id").notNull(),
    replayProfileId: uuid("replay_profile_id").notNull(),
    extractorReleaseId: uuid("extractor_release_id")
      .notNull()
      .references(() => extractorReleases.id, { onDelete: "restrict" }),
    gatePolicyVersionId: uuid("gate_policy_version_id").notNull(),
    githubRepositoryId: uuid("github_repository_id"),
    pullRequestId: uuid("pull_request_id"),
    triggerType: replayTriggerType("trigger_type").notNull(),
    triggerIdempotencyKey: text("trigger_idempotency_key").notNull(),
    baseImageDigest: text("base_image_digest").notNull(),
    candidateImageDigest: text("candidate_image_digest").notNull(),
    fixtureDigest: text("fixture_digest").notNull(),
    maskDigest: text("mask_digest").notNull(),
    runnerVersion: text("runner_version").notNull(),
    status: replayStatus("status").notNull().default("queued"),
    requestedByActorType: actorType("requested_by_actor_type").notNull(),
    requestedByActorId: text("requested_by_actor_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    reportObjectId: uuid("report_object_id"),
    reportDigest: text("report_digest"),
    signatureKeyId: text("signature_key_id"),
    signatureVerifiedAt: timestamp("signature_verified_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("replay_runs_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("replay_runs_immutable_input_uq").on(
      table.organizationId,
      table.replayCorpusId,
      table.replayProfileId,
      table.extractorReleaseId,
      table.gatePolicyVersionId,
      table.baseImageDigest,
      table.candidateImageDigest,
      table.fixtureDigest,
      table.maskDigest,
      table.triggerType,
      table.triggerIdempotencyKey,
    ),
    foreignKey({
      name: "replay_runs_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_runs_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_runs_corpus_fk",
      columns: [table.organizationId, table.replayCorpusId],
      foreignColumns: [replayCorpora.organizationId, replayCorpora.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_runs_profile_fk",
      columns: [table.organizationId, table.replayProfileId],
      foreignColumns: [replayProfiles.organizationId, replayProfiles.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_runs_policy_version_fk",
      columns: [table.organizationId, table.gatePolicyVersionId],
      foreignColumns: [gatePolicyVersions.organizationId, gatePolicyVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_runs_repository_fk",
      columns: [table.organizationId, table.githubRepositoryId],
      foreignColumns: [githubRepositories.organizationId, githubRepositories.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_runs_pull_request_fk",
      columns: [table.organizationId, table.pullRequestId],
      foreignColumns: [pullRequests.organizationId, pullRequests.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_runs_report_object_fk",
      columns: [table.organizationId, table.reportObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    index("replay_runs_service_created_idx").on(
      table.organizationId,
      table.apiServiceId,
      table.createdAt,
    ),
    index("replay_runs_pr_idx").on(
      table.organizationId,
      table.githubRepositoryId,
      table.pullRequestId,
    ),
  ],
);

export const replayAttempts = pgTable(
  "replay_attempts",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replayRunId: uuid("replay_run_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: replayStatus("status").notNull().default("queued"),
    runnerInstanceId: text("runner_instance_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    resultDigest: text("result_digest"),
    reportObjectId: uuid("report_object_id"),
    failureCode: text("failure_code"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("replay_attempts_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("replay_attempts_run_number_uq").on(table.replayRunId, table.attemptNumber),
    foreignKey({
      name: "replay_attempts_run_fk",
      columns: [table.organizationId, table.replayRunId],
      foreignColumns: [replayRuns.organizationId, replayRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_attempts_report_object_fk",
      columns: [table.organizationId, table.reportObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    check("replay_attempts_number_ck", sql`${table.attemptNumber} > 0`),
  ],
);

export const ciRunnerSessions = pgTable(
  "ci_runner_sessions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replayRunId: uuid("replay_run_id").notNull(),
    githubRepositoryId: uuid("github_repository_id"),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull(),
    nonceDigest: text("nonce_digest").notNull(),
    reportSigningPublicKey: text("report_signing_public_key").notNull(),
    signingKeyId: text("signing_key_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("ci_runner_sessions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("ci_runner_sessions_token_prefix_uq").on(table.tokenPrefix),
    uniqueIndex("ci_runner_sessions_active_run_uq")
      .on(table.replayRunId)
      .where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
    foreignKey({
      name: "ci_runner_sessions_run_fk",
      columns: [table.organizationId, table.replayRunId],
      foreignColumns: [replayRuns.organizationId, replayRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ci_runner_sessions_repository_fk",
      columns: [table.organizationId, table.githubRepositoryId],
      foreignColumns: [githubRepositories.organizationId, githubRepositories.id],
    }).onDelete("restrict"),
  ],
);

export const replayDeltas = pgTable(
  "replay_deltas",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replayRunId: uuid("replay_run_id").notNull(),
    apiOperationId: uuid("api_operation_id").notNull(),
    beforeBehaviorDefinitionId: uuid("before_behavior_definition_id"),
    afterBehaviorDefinitionId: uuid("after_behavior_definition_id"),
    kind: behaviorKind("kind").notNull(),
    deltaDigest: text("delta_digest").notNull(),
    normalizedBefore: jsonb("normalized_before"),
    normalizedAfter: jsonb("normalized_after"),
    maskApplied: jsonb("mask_applied").notNull().default({}),
    stability: deltaStability("stability").notNull().default("pending"),
    agreeingAttempts: integer("agreeing_attempts").notNull().default(0),
    totalAttempts: integer("total_attempts").notNull().default(0),
    quarantineReason: text("quarantine_reason"),
    receiptId: uuid("receipt_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("replay_deltas_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("replay_deltas_run_digest_uq").on(table.replayRunId, table.deltaDigest),
    foreignKey({
      name: "replay_deltas_run_fk",
      columns: [table.organizationId, table.replayRunId],
      foreignColumns: [replayRuns.organizationId, replayRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_deltas_operation_fk",
      columns: [table.organizationId, table.apiOperationId],
      foreignColumns: [apiOperations.organizationId, apiOperations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "replay_deltas_before_behavior_fk",
      columns: [table.organizationId, table.beforeBehaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_deltas_after_behavior_fk",
      columns: [table.organizationId, table.afterBehaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "replay_deltas_receipt_fk",
      columns: [table.organizationId, table.receiptId],
      foreignColumns: [receipts.organizationId, receipts.id],
    }).onDelete("restrict"),
    index("replay_deltas_run_stability_idx").on(table.replayRunId, table.stability),
    check(
      "replay_deltas_attempt_counts_ck",
      sql`${table.agreeingAttempts} >= 0 and ${table.totalAttempts} >= ${table.agreeingAttempts}`,
    ),
  ],
);

export const deltaClaimMatches = pgTable(
  "delta_claim_matches",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replayDeltaId: uuid("replay_delta_id").notNull(),
    dependencyClaimId: uuid("dependency_claim_id").notNull(),
    matchRuleVersion: text("match_rule_version").notNull(),
    matchDigest: text("match_digest").notNull(),
    matched: boolean("matched").notNull(),
    ineligibilityReason: text("ineligibility_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("delta_claim_matches_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("delta_claim_matches_identity_uq").on(
      table.replayDeltaId,
      table.dependencyClaimId,
      table.matchRuleVersion,
    ),
    foreignKey({
      name: "delta_claim_matches_delta_fk",
      columns: [table.organizationId, table.replayDeltaId],
      foreignColumns: [replayDeltas.organizationId, replayDeltas.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delta_claim_matches_claim_fk",
      columns: [table.organizationId, table.dependencyClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("cascade"),
  ],
);

export const deltaAssertionMatches = pgTable(
  "delta_assertion_matches",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    replayDeltaId: uuid("replay_delta_id").notNull(),
    assertionId: uuid("assertion_id").notNull(),
    matchRuleVersion: text("match_rule_version").notNull(),
    matchDigest: text("match_digest").notNull(),
    matched: boolean("matched").notNull(),
    ineligibilityReason: text("ineligibility_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("delta_assertion_matches_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("delta_assertion_matches_identity_uq").on(
      table.replayDeltaId,
      table.assertionId,
      table.matchRuleVersion,
    ),
    foreignKey({
      name: "delta_assertion_matches_delta_fk",
      columns: [table.organizationId, table.replayDeltaId],
      foreignColumns: [replayDeltas.organizationId, replayDeltas.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delta_assertion_matches_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("cascade"),
  ],
);
