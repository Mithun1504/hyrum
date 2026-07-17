import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { replayProfiles } from "./configuration";
import { gatePolicies } from "./gate-policies";
import { memberships, organizations } from "./identity";
import { apiServices } from "./services";
import { mutableTimestamps, softDelete, uuidPrimaryKey } from "./shared/columns";
import { integrationStatus } from "./shared/enums";

export const githubInstallations = pgTable(
  "github_installations",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    githubInstallationId: bigint("github_installation_id", { mode: "bigint" }).notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(),
    status: integrationStatus("status").notNull().default("pending"),
    permissions: jsonb("permissions").notNull().default({}),
    installedByMembershipId: uuid("installed_by_membership_id"),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    deletedAt: softDelete(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("github_installations_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("github_installations_external_id_uq").on(table.githubInstallationId),
    foreignKey({
      name: "github_installations_installer_fk",
      columns: [table.organizationId, table.installedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
  ],
);

export const githubRepositories = pgTable(
  "github_repositories",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    githubInstallationId: uuid("github_installation_id").notNull(),
    githubRepositoryId: bigint("github_repository_id", { mode: "bigint" }).notNull(),
    ownerLogin: text("owner_login").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    active: boolean("active").notNull().default(true),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [
    uniqueIndex("github_repositories_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("github_repositories_external_uq").on(
      table.githubInstallationId,
      table.githubRepositoryId,
    ),
    foreignKey({
      name: "github_repositories_installation_fk",
      columns: [table.organizationId, table.githubInstallationId],
      foreignColumns: [githubInstallations.organizationId, githubInstallations.id],
    }).onDelete("cascade"),
  ],
);

export const serviceRepositoryConnections = pgTable(
  "service_repository_connections",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    githubRepositoryId: uuid("github_repository_id").notNull(),
    gatePolicyId: uuid("gate_policy_id").notNull(),
    replayProfileId: uuid("replay_profile_id").notNull(),
    specPath: text("spec_path").notNull(),
    workflowPath: text("workflow_path").notNull(),
    baseImageBuildRef: text("base_image_build_ref").notNull(),
    candidateImageBuildRef: text("candidate_image_build_ref").notNull(),
    active: boolean("active").notNull().default(true),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [
    uniqueIndex("service_repository_connections_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("service_repository_connections_active_uq")
      .on(table.apiServiceId, table.githubRepositoryId, table.specPath)
      .where(sql`${table.active} and ${table.deletedAt} is null`),
    foreignKey({
      name: "service_repository_connections_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_repository_connections_repository_fk",
      columns: [table.organizationId, table.githubRepositoryId],
      foreignColumns: [githubRepositories.organizationId, githubRepositories.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_repository_connections_policy_fk",
      columns: [table.organizationId, table.gatePolicyId],
      foreignColumns: [gatePolicies.organizationId, gatePolicies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "service_repository_connections_profile_fk",
      columns: [table.organizationId, table.replayProfileId],
      foreignColumns: [replayProfiles.organizationId, replayProfiles.id],
    }).onDelete("restrict"),
  ],
);

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    githubRepositoryId: uuid("github_repository_id").notNull(),
    githubPullRequestId: bigint("github_pull_request_id", { mode: "bigint" }).notNull(),
    number: integer("number").notNull(),
    headSha: text("head_sha").notNull(),
    baseSha: text("base_sha").notNull(),
    state: text("state").notNull(),
    isFork: boolean("is_fork").notNull().default(false),
    authorLogin: text("author_login").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    updatedFromGithubAt: timestamp("updated_from_github_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("pull_requests_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("pull_requests_repo_number_uq").on(table.githubRepositoryId, table.number),
    uniqueIndex("pull_requests_external_uq").on(
      table.githubRepositoryId,
      table.githubPullRequestId,
    ),
    foreignKey({
      name: "pull_requests_repository_fk",
      columns: [table.organizationId, table.githubRepositoryId],
      foreignColumns: [githubRepositories.organizationId, githubRepositories.id],
    }).onDelete("cascade"),
    index("pull_requests_repo_head_idx").on(table.githubRepositoryId, table.headSha),
  ],
);
