import { consumerSchema, ledgerEntrySchema, receiptSchema } from "@hyrum/contracts";
import {
  and,
  behaviorDefinitions,
  consumers,
  type Database,
  desc,
  eq,
  ledgerEntries,
  receiptIsUnexpired,
  receipts,
  type TenantDb,
  withTenant,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { asIso, nullableIso, requireContext } from "./helpers";

const ledgerListSchema = z.object({ entries: z.array(ledgerEntrySchema) });
const consumerListSchema = z.object({ consumers: z.array(consumerSchema) });

function ledgerSelect(db: Database | TenantDb, organizationId: string) {
  return db
    .select({
      entry: ledgerEntries,
      kind: behaviorDefinitions.kind,
    })
    .from(ledgerEntries)
    .innerJoin(behaviorDefinitions, eq(behaviorDefinitions.id, ledgerEntries.behaviorId))
    .where(eq(ledgerEntries.organizationId, organizationId))
    .orderBy(desc(ledgerEntries.lastSeenAt))
    .limit(100);
}

function serializeLedger(row: Awaited<ReturnType<typeof ledgerSelect>>[number]) {
  return {
    id: row.entry.id,
    claim_id: row.entry.claimId,
    behavior_id: row.entry.behaviorId,
    consumer_id: row.entry.consumerId,
    operation_id: row.entry.operationId,
    kind: row.kind,
    tier: row.entry.tier,
    state: row.entry.state,
    title: row.entry.title,
    last_seen_at: asIso(row.entry.lastSeenAt),
    freshness_until: asIso(row.entry.freshnessUntil),
    receipt_id: row.entry.receiptId,
  };
}

export const ledgerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/ledger",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        response: { 200: ledgerListSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const rows = await withTenant(app.database.db, context.organizationId, (tx) =>
        ledgerSelect(tx, context.organizationId),
      );
      return { entries: rows.map(serializeLedger) };
    },
  );

  app.get(
    "/ledger/:id",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        response: { 200: ledgerEntrySchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const [row] = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select({ entry: ledgerEntries, kind: behaviorDefinitions.kind })
          .from(ledgerEntries)
          .innerJoin(behaviorDefinitions, eq(behaviorDefinitions.id, ledgerEntries.behaviorId))
          .where(
            and(
              eq(ledgerEntries.organizationId, context.organizationId),
              eq(ledgerEntries.id, request.params.id),
            ),
          )
          .limit(1),
      );
      if (!row) throw app.httpErrors.notFound();
      return serializeLedger(row);
    },
  );

  app.get(
    "/consumers",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["consumers"],
        security: [{ bearerAuth: [] }],
        response: { 200: consumerListSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const rows = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select()
          .from(consumers)
          .where(eq(consumers.organizationId, context.organizationId))
          .orderBy(desc(consumers.lastSeenAt))
          .limit(100),
      );
      return {
        consumers: rows.map((consumer) => ({
          id: consumer.id,
          stable_id: consumer.stableId,
          display_alias: consumer.displayAlias,
          last_seen_at: nullableIso(consumer.lastSeenAt),
        })),
      };
    },
  );

  app.get(
    "/receipts/:id",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["receipts"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        response: { 200: receiptSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const [receipt] = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select()
          .from(receipts)
          .where(
            and(
              eq(receipts.organizationId, context.organizationId),
              eq(receipts.id, request.params.id),
              receiptIsUnexpired(),
            ),
          )
          .limit(1),
      );
      if (!receipt) throw app.httpErrors.notFound();
      return {
        id: receipt.id,
        behavior_id: receipt.behaviorId,
        consumer_id: receipt.consumerId,
        operation_id: receipt.operationId,
        object_key: receipt.objectKey,
        digest: receipt.digest,
        redaction_version: receipt.redactionVersion,
        sequence_start: receipt.sequenceStart,
        sequence_end: receipt.sequenceEnd,
        excerpt: receipt.excerpt,
        expires_at: asIso(receipt.expiresAt),
      };
    },
  );
};
