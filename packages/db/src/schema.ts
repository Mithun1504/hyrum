import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const organizationRole = pgEnum("organization_role", [
  "owner",
  "admin",
  "engineer",
  "viewer",
]);
export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
]);
export const behaviorKind = pgEnum("behavior_kind", ["shape", "ordering", "error", "status"]);
export const evidenceTier = pgEnum("evidence_tier", ["T1", "T2", "T3"]);
export const claimState = pgEnum("claim_state", ["active", "stale", "dismissed"]);
export const assertionStatus = pgEnum("assertion_status", ["active", "expired", "resolved"]);
export const replayOutcome = pgEnum("replay_outcome", ["pass", "warn", "block"]);
export const assertionReplayOutcome = pgEnum("assertion_replay_outcome", ["pass", "fail"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workosOrganizationId: text("workos_organization_id").notNull().unique(),
  name: text("name").notNull(),
  region: text("region").notNull().default("auto"),
  retentionDays: integer("retention_days").notNull().default(30),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workosUserId: text("workos_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationRole("role").notNull().default("viewer"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("memberships_org_user_unique").on(table.organizationId, table.userId),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    signingPublicKey: text("signing_public_key"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("agents_token_prefix_unique").on(table.tokenPrefix),
    uniqueIndex("agents_org_prefix_unique").on(table.organizationId, table.tokenPrefix),
    index("agents_org_idx").on(table.organizationId),
  ],
);

export const githubRepositories = pgTable(
  "github_repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("github_repositories_org_installation_repo_unique").on(
      table.organizationId,
      table.installationId,
      table.owner,
      table.name,
    ),
    index("github_repositories_org_active_idx").on(table.organizationId, table.active),
  ],
);

export const slackChannels = pgTable(
  "slack_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("slack_channels_org_channel_unique").on(table.organizationId, table.channelId),
    index("slack_channels_org_active_idx").on(table.organizationId, table.active),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("jobs_org_idempotency_unique").on(table.organizationId, table.idempotencyKey),
    index("jobs_claim_idx").on(table.status, table.runAfter, table.leaseExpiresAt),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("outbox_org_idempotency_unique").on(table.organizationId, table.idempotencyKey),
    index("outbox_unpublished_idx").on(table.publishedAt, table.createdAt),
    index("outbox_org_topic_idx").on(table.organizationId, table.topic),
  ],
);

export const progressEvents = pgTable(
  "progress_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    resourceId: text("resource_id"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("progress_events_org_id_idx").on(table.organizationId, table.id)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_org_created_idx").on(table.organizationId, table.createdAt)],
);
