import { sql } from "drizzle-orm";
import {
  bigint,
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
import { memberships, organizations, supportAccessGrants, users } from "./identity";
import { createdAt, uuidPrimaryKey } from "./shared/columns";
import { actorType, auditOutcome, dataSubjectRequestType, requestStatus } from "./shared/enums";
import { storedObjects } from "./storage";

export const auditEvents = pgTable(
  "audit_events",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    id: bigint("id", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"),
    supportAccessGrantId: uuid("support_access_grant_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id").notNull(),
    sourceIpHash: text("source_ip_hash"),
    userAgentFamily: text("user_agent_family"),
    changes: jsonb("changes").notNull().default({}),
    outcome: auditOutcome("outcome").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.id] }),
    foreignKey({
      name: "audit_events_support_grant_fk",
      columns: [table.organizationId, table.supportAccessGrantId],
      foreignColumns: [supportAccessGrants.organizationId, supportAccessGrants.id],
    }).onDelete("restrict"),
    index("audit_events_org_time_idx").on(table.organizationId, table.occurredAt),
    index("audit_events_resource_idx").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
      table.occurredAt,
    ),
    index("audit_events_actor_time_idx").on(
      table.organizationId,
      table.actorType,
      table.actorId,
      table.occurredAt,
    ),
  ],
);

export const dataSubjectRequests = pgTable(
  "data_subject_requests",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    requestType: dataSubjectRequestType("request_type").notNull(),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "restrict" }),
    requestedByMembershipId: uuid("requested_by_membership_id").notNull(),
    status: requestStatus("status").notNull().default("pending"),
    verificationCompletedAt: timestamp("verification_completed_at", { withTimezone: true }),
    exportObjectId: uuid("export_object_id"),
    deletionManifestObjectId: uuid("deletion_manifest_object_id"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
  },
  (table) => [
    uniqueIndex("data_subject_requests_org_id_uq").on(table.organizationId, table.id),
    foreignKey({
      name: "data_subject_requests_requester_fk",
      columns: [table.organizationId, table.requestedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "data_subject_requests_export_object_fk",
      columns: [table.organizationId, table.exportObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "data_subject_requests_manifest_object_fk",
      columns: [table.organizationId, table.deletionManifestObjectId],
      foreignColumns: [storedObjects.organizationId, storedObjects.id],
    }).onDelete("restrict"),
    index("data_subject_requests_status_idx").on(
      table.organizationId,
      table.status,
      table.requestedAt,
    ),
    check(
      "data_subject_requests_subject_ck",
      sql`${table.requestType} <> 'delete_user' or ${table.subjectUserId} is not null`,
    ),
  ],
);

export const platformAuditEvents = pgTable(
  "platform_audit_events",
  {
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    id: bigint("id", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id").notNull(),
    changeDigest: text("change_digest").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    outcome: auditOutcome("outcome").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.id] }),
    index("platform_audit_events_resource_idx").on(
      table.resourceType,
      table.resourceId,
      table.occurredAt,
    ),
    index("platform_audit_events_actor_idx").on(table.actorType, table.actorId, table.occurredAt),
    check(
      "platform_audit_events_actor_type_ck",
      sql`${table.actorType} in ('platform_operator', 'system')`,
    ),
  ],
);
