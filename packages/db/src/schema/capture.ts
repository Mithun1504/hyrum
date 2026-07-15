import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { redactionPolicyVersions, samplingPolicyVersions } from "./configuration";
import { organizationKeyVersions, organizations } from "./identity";
import { apiServices, extractorReleases, serviceEnvironments } from "./services";
import { createdAt, mutableTimestamps, softDelete, uuidPrimaryKey } from "./shared/columns";
import {
  adapterType,
  agentStatus,
  consumerAliasSource,
  consumerIdentitySource,
  ingestionStatus,
  sessionCompleteness,
} from "./shared/enums";
import { storedObjects } from "./storage";

export const agents = pgTable(
  "agents",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    name: text("name").notNull(),
    externalInstanceKey: text("external_instance_key").notNull(),
    status: agentStatus("status").notNull().default("pending"),
    adapterType: adapterType("adapter_type").notNull(),
    agentVersion: text("agent_version").notNull(),
    extractorReleaseId: uuid("extractor_release_id")
      .notNull()
      .references(() => extractorReleases.id, { onDelete: "restrict" }),
    redactionPolicyVersionId: uuid("redaction_policy_version_id").notNull(),
    samplingPolicyVersionId: uuid("sampling_policy_version_id").notNull(),
    configRevision: integer("config_revision").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("agents_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("agents_external_instance_uq").on(table.organizationId, table.externalInstanceKey),
    foreignKey({
      name: "agents_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agents_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agents_redaction_policy_fk",
      columns: [table.organizationId, table.redactionPolicyVersionId],
      foreignColumns: [redactionPolicyVersions.organizationId, redactionPolicyVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "agents_sampling_policy_fk",
      columns: [table.organizationId, table.samplingPolicyVersionId],
      foreignColumns: [samplingPolicyVersions.organizationId, samplingPolicyVersions.id],
    }).onDelete("restrict"),
    index("agents_environment_health_idx").on(table.environmentId, table.status, table.lastSeenAt),
    check("agents_config_revision_ck", sql`${table.configRevision} > 0`),
  ],
);

export const machineCredentials = pgTable(
  "machine_credentials",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    rotatedFromId: uuid("rotated_from_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("machine_credentials_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("machine_credentials_token_prefix_uq").on(table.tokenPrefix),
    foreignKey({
      name: "machine_credentials_agent_fk",
      columns: [table.organizationId, table.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "machine_credentials_rotated_from_fk",
      columns: [table.organizationId, table.rotatedFromId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("set null"),
    index("machine_credentials_agent_idx").on(table.agentId, table.revokedAt),
  ],
);

export const ingestionBatches = pgTable(
  "ingestion_batches",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    agentBatchId: text("agent_batch_id").notNull(),
    storedObjectId: uuid("stored_object_id").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    extractorReleaseId: uuid("extractor_release_id")
      .notNull()
      .references(() => extractorReleases.id, { onDelete: "restrict" }),
    redactionPolicyVersionId: uuid("redaction_policy_version_id").notNull(),
    samplingPolicyVersionId: uuid("sampling_policy_version_id").notNull(),
    sessionCount: integer("session_count").notNull().default(0),
    acceptedItemCount: integer("accepted_item_count").notNull().default(0),
    rejectedItemCount: integer("rejected_item_count").notNull().default(0),
    status: ingestionStatus("status").notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    rejectionManifestObjectId: uuid("rejection_manifest_object_id"),
    rejectionSummary: jsonb("rejection_summary").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("ingestion_batches_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("ingestion_batches_agent_batch_uq").on(table.agentId, table.agentBatchId),
    uniqueIndex("ingestion_batches_digest_agent_uq").on(
      table.organizationId,
      table.payloadDigest,
      table.agentId,
    ),
    foreignKey({
      name: "ingestion_batches_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ingestion_batches_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ingestion_batches_agent_fk",
      columns: [table.organizationId, table.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ingestion_batches_object_fk",
      columns: [table.organizationId, table.storedObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "ingestion_batches_rejection_object_fk",
      columns: [table.organizationId, table.rejectionManifestObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "ingestion_batches_redaction_policy_fk",
      columns: [table.organizationId, table.redactionPolicyVersionId],
      foreignColumns: [redactionPolicyVersions.organizationId, redactionPolicyVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "ingestion_batches_sampling_policy_fk",
      columns: [table.organizationId, table.samplingPolicyVersionId],
      foreignColumns: [samplingPolicyVersions.organizationId, samplingPolicyVersions.id],
    }).onDelete("restrict"),
    index("ingestion_batches_processing_idx").on(
      table.organizationId,
      table.status,
      table.receivedAt,
    ),
    check(
      "ingestion_batches_counts_ck",
      sql`${table.sessionCount} >= 0 and ${table.acceptedItemCount} >= 0 and ${table.rejectedItemCount} >= 0`,
    ),
  ],
);

export const consumers = pgTable(
  "consumers",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    displayAlias: text("display_alias").notNull(),
    aliasSource: consumerAliasSource("alias_source").notNull().default("generated"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    requestCount: bigint("request_count", { mode: "number" }).notNull().default(0),
    lowVolume: boolean("low_volume").notNull().default(false),
    metadata: jsonb("metadata").notNull().default({}),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [
    uniqueIndex("consumers_org_id_uq").on(table.organizationId, table.id),
    foreignKey({
      name: "consumers_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "consumers_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    index("consumers_environment_seen_idx").on(table.environmentId, table.lastSeenAt),
    index("consumers_alias_idx").using("gin", sql`${table.displayAlias} gin_trgm_ops`),
    check("consumers_request_count_ck", sql`${table.requestCount} >= 0`),
  ],
);

export const consumerIdentifiers = pgTable(
  "consumer_identifiers",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    environmentId: uuid("environment_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    identitySource: consumerIdentitySource("identity_source").notNull(),
    identifierHmac: text("identifier_hmac").notNull(),
    consumerHmacKeyVersionId: uuid("consumer_hmac_key_version_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("consumer_identifiers_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("consumer_identifiers_resolution_uq").on(
      table.environmentId,
      table.consumerHmacKeyVersionId,
      table.identifierHmac,
    ),
    uniqueIndex("consumer_identifiers_primary_uq")
      .on(table.consumerId, table.consumerHmacKeyVersionId)
      .where(sql`${table.isPrimary} and ${table.retiredAt} is null`),
    foreignKey({
      name: "consumer_identifiers_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "consumer_identifiers_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "consumer_identifiers_key_fk",
      columns: [table.organizationId, table.consumerHmacKeyVersionId],
      foreignColumns: [organizationKeyVersions.organizationId, organizationKeyVersions.id],
    }).onDelete("restrict"),
    index("consumer_identifiers_lookup_idx").on(
      table.organizationId,
      table.environmentId,
      table.consumerHmacKeyVersionId,
      table.identifierHmac,
    ),
  ],
);

export const captureSessions = pgTable(
  "capture_sessions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    environmentId: uuid("environment_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    ingestionBatchId: uuid("ingestion_batch_id").notNull(),
    sessionHmac: text("session_hmac").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    firstSequenceNo: bigint("first_sequence_no", { mode: "number" }).notNull(),
    lastSequenceNo: bigint("last_sequence_no", { mode: "number" }).notNull(),
    eventCount: integer("event_count").notNull(),
    completeness: sessionCompleteness("completeness").notNull(),
    correlationSource: text("correlation_source").notNull(),
    samplingProbability: numeric("sampling_probability", { precision: 6, scale: 5 }).notNull(),
    lowVolumeBoostApplied: boolean("low_volume_boost_applied").notNull().default(false),
    structuralHmacKeyVersionId: uuid("structural_hmac_key_version_id").notNull(),
    receiptBundleObjectId: uuid("receipt_bundle_object_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("capture_sessions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("capture_sessions_identity_uq").on(
      table.environmentId,
      table.consumerId,
      table.sessionHmac,
      table.startedAt,
    ),
    foreignKey({
      name: "capture_sessions_environment_fk",
      columns: [table.organizationId, table.environmentId],
      foreignColumns: [serviceEnvironments.organizationId, serviceEnvironments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "capture_sessions_agent_fk",
      columns: [table.organizationId, table.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "capture_sessions_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "capture_sessions_batch_fk",
      columns: [table.organizationId, table.ingestionBatchId],
      foreignColumns: [ingestionBatches.organizationId, ingestionBatches.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "capture_sessions_structural_key_fk",
      columns: [table.organizationId, table.structuralHmacKeyVersionId],
      foreignColumns: [organizationKeyVersions.organizationId, organizationKeyVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "capture_sessions_receipt_object_fk",
      columns: [table.organizationId, table.receiptBundleObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    index("capture_sessions_consumer_time_idx").on(
      table.organizationId,
      table.consumerId,
      table.startedAt,
    ),
    index("capture_sessions_expiry_idx").on(table.organizationId, table.expiresAt),
    check("capture_sessions_sequence_ck", sql`${table.lastSequenceNo} >= ${table.firstSequenceNo}`),
    check("capture_sessions_time_ck", sql`${table.endedAt} >= ${table.startedAt}`),
    check("capture_sessions_event_count_ck", sql`${table.eventCount} > 0`),
    check(
      "capture_sessions_sampling_ck",
      sql`${table.samplingProbability} > 0 and ${table.samplingProbability} <= 1`,
    ),
  ],
);
