import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { behaviorDefinitions } from "./behaviors";
import { consumers } from "./capture";
import { dependencyClaims, receipts } from "./evidence";
import { memberships, organizations } from "./identity";
import { apiServices } from "./services";
import { createdAt, mutableTimestamps, uuidPrimaryKey } from "./shared/columns";
import {
  actorType,
  assertionEventType,
  assertionResolution,
  assertionScope,
  assertionStatus,
  breakingChangePlanStatus,
  communicationStatus,
  evidenceTier,
} from "./shared/enums";

export const assertions = pgTable(
  "assertions",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    sourceClaimId: uuid("source_claim_id"),
    ownerMembershipId: uuid("owner_membership_id").notNull(),
    reason: text("reason").notNull(),
    status: assertionStatus("status").notNull().default("active"),
    scope: assertionScope("scope").notNull().default("all_consumers"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '90 days'`),
    remindAt: timestamp("remind_at", { withTimezone: true }),
    resolution: assertionResolution("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByMembershipId: uuid("resolved_by_membership_id"),
    supersedesAssertionId: uuid("supersedes_assertion_id"),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("assertions_org_id_uq").on(table.organizationId, table.id),
    index("assertions_active_expiry_idx")
      .on(table.organizationId, table.expiresAt)
      .where(sql`${table.status} in ('active', 'expiring')`),
    foreignKey({
      name: "assertions_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "assertions_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "assertions_source_claim_fk",
      columns: [table.organizationId, table.sourceClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "assertions_owner_fk",
      columns: [table.organizationId, table.ownerMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "assertions_resolver_fk",
      columns: [table.organizationId, table.resolvedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "assertions_supersedes_fk",
      columns: [table.organizationId, table.supersedesAssertionId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    check("assertions_reason_ck", sql`length(trim(${table.reason})) > 0`),
    check("assertions_window_ck", sql`${table.expiresAt} > ${table.startsAt}`),
    check(
      "assertions_reminder_ck",
      sql`${table.remindAt} is null or (${table.remindAt} >= ${table.startsAt} and ${table.remindAt} <= ${table.expiresAt})`,
    ),
  ],
);

export const assertionConsumers = pgTable(
  "assertion_consumers",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assertionId: uuid("assertion_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.assertionId, table.consumerId] }),
    foreignKey({
      name: "assertion_consumers_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "assertion_consumers_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("cascade"),
  ],
);

export const assertionEvents = pgTable(
  "assertion_events",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assertionId: uuid("assertion_id").notNull(),
    eventType: assertionEventType("event_type").notNull(),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"),
    reason: text("reason"),
    previousExpiry: timestamp("previous_expiry", { withTimezone: true }),
    newExpiry: timestamp("new_expiry", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("assertion_events_org_id_uq").on(table.organizationId, table.id),
    foreignKey({
      name: "assertion_events_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("cascade"),
    index("assertion_events_assertion_time_idx").on(table.assertionId, table.createdAt),
  ],
);

export const breakingChangePlans = pgTable(
  "breaking_change_plans",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    apiServiceId: uuid("api_service_id").notNull(),
    assertionId: uuid("assertion_id").notNull(),
    behaviorDefinitionId: uuid("behavior_definition_id").notNull(),
    ownerMembershipId: uuid("owner_membership_id").notNull(),
    plannedFor: timestamp("planned_for", { withTimezone: true }).notNull(),
    status: breakingChangePlanStatus("status").notNull().default("draft"),
    reason: text("reason").notNull(),
    communicationDueAt: timestamp("communication_due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("breaking_change_plans_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("breaking_change_plans_assertion_uq").on(table.assertionId),
    foreignKey({
      name: "breaking_change_plans_service_fk",
      columns: [table.organizationId, table.apiServiceId],
      foreignColumns: [apiServices.organizationId, apiServices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "breaking_change_plans_assertion_fk",
      columns: [table.organizationId, table.assertionId],
      foreignColumns: [assertions.organizationId, assertions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "breaking_change_plans_behavior_fk",
      columns: [table.organizationId, table.behaviorDefinitionId],
      foreignColumns: [behaviorDefinitions.organizationId, behaviorDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "breaking_change_plans_owner_fk",
      columns: [table.organizationId, table.ownerMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    index("breaking_change_plans_actionable_idx").on(
      table.organizationId,
      table.status,
      table.plannedFor,
    ),
    check("breaking_change_plans_reason_ck", sql`length(trim(${table.reason})) > 0`),
    check("breaking_change_plans_planned_ck", sql`${table.plannedFor} > ${table.createdAt}`),
  ],
);

export const breakingChangeImpacts = pgTable(
  "breaking_change_impacts",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    breakingChangePlanId: uuid("breaking_change_plan_id").notNull(),
    consumerId: uuid("consumer_id").notNull(),
    dependencyClaimId: uuid("dependency_claim_id"),
    evidenceTier: evidenceTier("evidence_tier").notNull(),
    impactDigest: text("impact_digest").notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
    receiptId: uuid("receipt_id"),
    communicationStatus: communicationStatus("communication_status").notNull().default("pending"),
    exclusionReason: text("exclusion_reason"),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("breaking_change_impacts_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("breaking_change_impacts_plan_consumer_uq").on(
      table.breakingChangePlanId,
      table.consumerId,
    ),
    foreignKey({
      name: "breaking_change_impacts_plan_fk",
      columns: [table.organizationId, table.breakingChangePlanId],
      foreignColumns: [breakingChangePlans.organizationId, breakingChangePlans.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "breaking_change_impacts_consumer_fk",
      columns: [table.organizationId, table.consumerId],
      foreignColumns: [consumers.organizationId, consumers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "breaking_change_impacts_claim_fk",
      columns: [table.organizationId, table.dependencyClaimId],
      foreignColumns: [dependencyClaims.organizationId, dependencyClaims.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "breaking_change_impacts_receipt_fk",
      columns: [table.organizationId, table.receiptId],
      foreignColumns: [receipts.organizationId, receipts.id],
    }).onDelete("restrict"),
    check(
      "breaking_change_impacts_exclusion_ck",
      sql`${table.communicationStatus} <> 'excluded' or length(trim(${table.exclusionReason})) > 0`,
    ),
  ],
);
