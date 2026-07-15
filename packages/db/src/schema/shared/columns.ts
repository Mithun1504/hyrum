import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

export const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const uuidPrimaryKey = (name = "id") => uuid(name).primaryKey().defaultRandom();

export const tenantId = () => uuid("organization_id").notNull();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const mutableTimestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

export const softDelete = () => timestamp("deleted_at", { withTimezone: true });
