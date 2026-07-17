import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { assertions } from "./assertions";
import { gateDecisions } from "./gates";
import { githubRepositories, pullRequests } from "./github-core";
import { memberships, organizationKeyVersions, organizations } from "./identity";
import { replayRuns } from "./replay";
import { apiServices } from "./services";
import { mutableTimestamps, uuidPrimaryKey } from "./shared/columns";
import {
  integrationStatus,
  notificationChannel,
  notificationSeverity,
  notificationStatus,
} from "./shared/enums";

export const githubCheckRuns = pgTable(
  "github_check_runs",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    githubRepositoryId: uuid("github_repository_id").notNull(),
    pullRequestId: uuid("pull_request_id").notNull(),
    replayRunId: uuid("replay_run_id").notNull(),
    gateDecisionId: uuid("gate_decision_id").notNull(),
    githubCheckRunId: bigint("github_check_run_id", { mode: "bigint" }),
    externalId: text("external_id").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    detailsUrl: text("details_url"),
    lastPayloadDigest: text("last_payload_digest"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    failureCode: text("failure_code"),
  },
  (table) => [
    uniqueIndex("github_check_runs_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("github_check_runs_external_id_uq").on(table.externalId),
    uniqueIndex("github_check_runs_replay_run_uq").on(table.replayRunId),
    foreignKey({
      name: "github_check_runs_repository_fk",
      columns: [table.organizationId, table.githubRepositoryId],
      foreignColumns: [githubRepositories.organizationId, githubRepositories.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "github_check_runs_pull_request_fk",
      columns: [table.organizationId, table.pullRequestId],
      foreignColumns: [pullRequests.organizationId, pullRequests.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "github_check_runs_replay_run_fk",
      columns: [table.organizationId, table.replayRunId],
      foreignColumns: [replayRuns.organizationId, replayRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "github_check_runs_gate_decision_fk",
      columns: [table.organizationId, table.gateDecisionId],
      foreignColumns: [gateDecisions.organizationId, gateDecisions.id],
    }).onDelete("cascade"),
  ],
);

export const slackInstallations = pgTable(
  "slack_installations",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    slackTeamId: text("slack_team_id").notNull(),
    teamName: text("team_name").notNull(),
    status: integrationStatus("status").notNull().default("pending"),
    encryptedBotToken: text("encrypted_bot_token").notNull(),
    encryptionKeyVersionId: uuid("encryption_key_version_id").notNull(),
    scopes: text("scopes").array().notNull(),
    installedByMembershipId: uuid("installed_by_membership_id"),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("slack_installations_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("slack_installations_team_uq").on(table.organizationId, table.slackTeamId),
    foreignKey({
      name: "slack_installations_key_fk",
      columns: [table.organizationId, table.encryptionKeyVersionId],
      foreignColumns: [organizationKeyVersions.organizationId, organizationKeyVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "slack_installations_installer_fk",
      columns: [table.organizationId, table.installedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
  ],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    provider: text("provider").notNull(),
    deliveryId: text("delivery_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
  },
  (table) => [
    uniqueIndex("webhook_deliveries_provider_delivery_uq").on(table.provider, table.deliveryId),
    index("webhook_deliveries_pending_idx").on(table.status, table.receivedAt),
  ],
);

export const notificationRoutes = pgTable(
  "notification_routes",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id"),
    eventType: text("event_type").notNull(),
    channel: notificationChannel("channel").notNull(),
    slackInstallationId: uuid("slack_installation_id"),
    destinationId: text("destination_id"),
    minimumSeverity: notificationSeverity("minimum_severity").notNull().default("info"),
    enabled: boolean("enabled").notNull().default(true),
    createdByMembershipId: uuid("created_by_membership_id"),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("notification_routes_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("notification_routes_service_in_app_uq")
      .on(table.organizationId, table.apiServiceId, table.eventType, table.channel)
      .where(
        sql`${table.enabled} and ${table.apiServiceId} is not null and ${table.channel} = 'in_app'`,
      ),
    uniqueIndex("notification_routes_org_in_app_uq")
      .on(table.organizationId, table.eventType, table.channel)
      .where(
        sql`${table.enabled} and ${table.apiServiceId} is null and ${table.channel} = 'in_app'`,
      ),
    uniqueIndex("notification_routes_service_slack_uq")
      .on(
        table.organizationId,
        table.apiServiceId,
        table.eventType,
        table.channel,
        table.slackInstallationId,
        table.destinationId,
      )
      .where(
        sql`${table.enabled} and ${table.apiServiceId} is not null and ${table.channel} = 'slack'`,
      ),
    uniqueIndex("notification_routes_org_slack_uq")
      .on(
        table.organizationId,
        table.eventType,
        table.channel,
        table.slackInstallationId,
        table.destinationId,
      )
      .where(
        sql`${table.enabled} and ${table.apiServiceId} is null and ${table.channel} = 'slack'`,
      ),
    foreignKey({
      name: "notification_routes_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notification_routes_slack_fk",
      columns: [table.organizationId, table.slackInstallationId],
      foreignColumns: [slackInstallations.organizationId, slackInstallations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notification_routes_creator_fk",
      columns: [table.organizationId, table.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    check(
      "notification_routes_channel_ck",
      sql`(${table.channel} = 'in_app' and ${table.slackInstallationId} is null and ${table.destinationId} is null) or (${table.channel} = 'slack' and ${table.slackInstallationId} is not null and length(trim(${table.destinationId})) > 0)`,
    ),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    membershipId: uuid("membership_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    eventType: text("event_type").notNull(),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    digestEnabled: boolean("digest_enabled").notNull().default(true),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.membershipId, table.eventType] }),
    foreignKey({
      name: "notification_preferences_membership_fk",
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("cascade"),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    targetMembershipId: uuid("target_membership_id"),
    apiServiceId: uuid("api_service_id"),
    assertionId: uuid("assertion_id"),
    replayRunId: uuid("replay_run_id"),
    gateDecisionId: uuid("gate_decision_id"),
    eventType: text("event_type").notNull(),
    severity: notificationSeverity("severity").notNull(),
    title: text("title").notNull(),
    bodyText: text("body_text").notNull(),
    deepLinkPath: text("deep_link_path"),
    deduplicationKey: text("deduplication_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notifications_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("notifications_deduplication_uq").on(table.organizationId, table.deduplicationKey),
    foreignKey({
      name: "notifications_target_membership_fk",
      columns: [table.organizationId, table.targetMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notifications_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notifications_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notifications_replay_run_fk",
      columns: [table.organizationId, table.replayRunId],
      foreignColumns: [replayRuns.organizationId, replayRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notifications_gate_decision_fk",
      columns: [table.organizationId, table.gateDecisionId],
      foreignColumns: [gateDecisions.organizationId, gateDecisions.id],
    }).onDelete("cascade"),
    index("notifications_inbox_idx").on(
      table.organizationId,
      table.targetMembershipId,
      table.readAt,
      table.createdAt,
    ),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    notificationId: uuid("notification_id").notNull(),
    notificationRouteId: uuid("notification_route_id").notNull(),
    channel: notificationChannel("channel").notNull(),
    status: notificationStatus("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("notification_deliveries_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("notification_deliveries_notification_route_uq").on(
      table.notificationId,
      table.notificationRouteId,
    ),
    foreignKey({
      name: "notification_deliveries_notification_fk",
      columns: [table.organizationId, table.notificationId],
      foreignColumns: [notifications.organizationId, notifications.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notification_deliveries_route_fk",
      columns: [table.organizationId, table.notificationRouteId],
      foreignColumns: [notificationRoutes.organizationId, notificationRoutes.id],
    }).onDelete("cascade"),
    index("notification_deliveries_pending_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.status} in ('queued', 'failed')`),
  ],
);
