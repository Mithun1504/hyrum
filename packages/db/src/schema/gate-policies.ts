import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { memberships, organizations } from "./identity";
import { apiServices } from "./services";
import { mutableTimestamps, softDelete, uuidPrimaryKey } from "./shared/columns";
import { gateOutcome, gatePolicyVersionStatus } from "./shared/enums";

export const gatePolicies = pgTable(
  "gate_policies",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    createdByMembershipId: uuid("created_by_membership_id"),
    ...mutableTimestamps(),
    deletedAt: softDelete(),
  },
  (table) => [
    uniqueIndex("gate_policies_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("gate_policies_active_name_uq")
      .on(table.apiServiceId, table.name)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("gate_policies_default_uq")
      .on(table.apiServiceId)
      .where(sql`${table.isDefault} and ${table.deletedAt} is null`),
    foreignKey({
      name: "gate_policies_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_policies_creator_fk",
      columns: [table.organizationId, table.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
  ],
);

export const gatePolicyVersions = pgTable(
  "gate_policy_versions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    gatePolicyId: uuid("gate_policy_id").notNull(),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(),
    configDigest: text("config_digest").notNull(),
    t1Action: gateOutcome("t1_action").notNull().default("block"),
    t2Action: gateOutcome("t2_action").notNull().default("warn"),
    t3Action: gateOutcome("t3_action").notNull().default("pass"),
    assertionAction: gateOutcome("assertion_action").notNull().default("block"),
    flakyAction: gateOutcome("flaky_action").notNull().default("warn"),
    minimumStableAttempts: integer("minimum_stable_attempts").notNull().default(2),
    status: gatePolicyVersionStatus("status").notNull().default("draft"),
    createdByMembershipId: uuid("created_by_membership_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("gate_policy_versions_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("gate_policy_versions_policy_version_uq").on(table.gatePolicyId, table.version),
    uniqueIndex("gate_policy_versions_active_uq")
      .on(table.gatePolicyId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      name: "gate_policy_versions_policy_fk",
      columns: [table.organizationId, table.gatePolicyId],
      foreignColumns: [gatePolicies.organizationId, gatePolicies.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "gate_policy_versions_creator_fk",
      columns: [table.organizationId, table.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("set null"),
    check("gate_policy_versions_version_ck", sql`${table.version} > 0`),
    check("gate_policy_versions_attempts_ck", sql`${table.minimumStableAttempts} >= 2`),
    check("gate_policy_versions_t1_action_ck", sql`${table.t1Action} in ('block', 'warn', 'note')`),
    check("gate_policy_versions_t2_action_ck", sql`${table.t2Action} in ('warn', 'note', 'pass')`),
    check("gate_policy_versions_t3_action_ck", sql`${table.t3Action} in ('note', 'pass')`),
    check(
      "gate_policy_versions_assertion_action_ck",
      sql`${table.assertionAction} in ('block', 'warn', 'note')`,
    ),
    check(
      "gate_policy_versions_flaky_action_ck",
      sql`${table.flakyAction} in ('warn', 'note', 'pass')`,
    ),
  ],
);
