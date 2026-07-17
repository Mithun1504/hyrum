import { sql } from "drizzle-orm";
import {
  bigint,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationKeyVersions, organizations } from "./identity";
import { createdAt, softDelete, uuidPrimaryKey } from "./shared/columns";
import { actorType, objectAvailability, objectKind, objectScanStatus } from "./shared/enums";

export const storedObjects = pgTable(
  "stored_objects",
  {
    id: uuidPrimaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kind: objectKind("kind").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    contentEncoding: text("content_encoding"),
    byteSize: bigint("byte_size", { mode: "bigint" }).notNull(),
    sha256Digest: text("sha256_digest").notNull(),
    encryptionKeyVersionId: uuid("encryption_key_version_id"),
    scanStatus: objectScanStatus("scan_status").notNull().default("pending"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    scanFailureCode: text("scan_failure_code"),
    availabilityStatus: objectAvailability("availability_status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    deletedAt: softDelete(),
    deletionReason: text("deletion_reason"),
    createdByActorType: actorType("created_by_actor_type").notNull(),
    createdByActorId: text("created_by_actor_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("stored_objects_org_id_uq").on(table.organizationId, table.id),
    uniqueIndex("stored_objects_bucket_key_uq").on(table.bucket, table.objectKey),
    uniqueIndex("stored_objects_safe_dedup_uq")
      .on(table.organizationId, table.kind, table.sha256Digest)
      .where(sql`${table.deletedAt} is null and ${table.availabilityStatus} <> 'quarantined'`),
    foreignKey({
      name: "stored_objects_encryption_key_fk",
      columns: [table.organizationId, table.encryptionKeyVersionId],
      foreignColumns: [organizationKeyVersions.organizationId, organizationKeyVersions.id],
    }).onDelete("restrict"),
    index("stored_objects_expiry_idx").on(table.organizationId, table.expiresAt),
    index("stored_objects_pending_scan_idx")
      .on(table.organizationId, table.createdAt)
      .where(sql`${table.scanStatus} = 'pending'`),
    index("stored_objects_availability_idx").on(table.organizationId, table.availabilityStatus),
  ],
);
