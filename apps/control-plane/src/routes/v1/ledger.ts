import { consumerSchema, ledgerEntrySchema, receiptSchema } from "@hyrum/contracts";
import {
  and,
  assertions,
  behaviorDefinitions,
  behaviorObservations,
  consumers,
  type Database,
  desc,
  eq,
  ledgerEntries,
  operations,
  receiptIsUnexpired,
  receipts,
  sql,
  type TenantDb,
  withTenant,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { asIso, nullableIso, requireContext } from "./helpers";

const ledgerListSchema = z.object({ entries: z.array(ledgerEntrySchema) });
const consumerListSchema = z.object({ consumers: z.array(consumerSchema) });

function ledgerSelect(db: Database | TenantDb, organizationId: string, entryId?: string) {
  return db
    .select({
      entry: ledgerEntries,
      kind: behaviorDefinitions.kind,
      endpoint: sql<string>`coalesce(${operations.method} || ' ' || ${operations.pathTemplate}, 'Unscoped operation')`,
      consumerAlias: consumers.displayAlias,
      consumerStableId: consumers.stableId,
      observationCount: sql<number>`coalesce((select sum(${behaviorObservations.count}) from ${behaviorObservations} where ${behaviorObservations.organizationId} = ${organizationId} and ${behaviorObservations.behaviorId} = ${ledgerEntries.behaviorId} and ${behaviorObservations.consumerId} = ${ledgerEntries.consumerId}), 0)::int`,
      sessionCount: sql<number>`coalesce((select count(distinct ${behaviorObservations.captureSessionId}) from ${behaviorObservations} where ${behaviorObservations.organizationId} = ${organizationId} and ${behaviorObservations.behaviorId} = ${ledgerEntries.behaviorId} and ${behaviorObservations.consumerId} = ${ledgerEntries.consumerId}), 0)::int`,
      owner: sql<
        string | null
      >`(select ${assertions.ownerId} from ${assertions} where ${assertions.organizationId} = ${organizationId} and ${assertions.behaviorId} = ${ledgerEntries.behaviorId} and ${assertions.status} = 'active' and ${assertions.expiresAt} > now() order by ${assertions.createdAt} desc limit 1)`,
      receiptDigest: receipts.digest,
    })
    .from(ledgerEntries)
    .innerJoin(behaviorDefinitions, eq(behaviorDefinitions.id, ledgerEntries.behaviorId))
    .innerJoin(consumers, eq(consumers.id, ledgerEntries.consumerId))
    .leftJoin(operations, eq(operations.id, ledgerEntries.operationId))
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(
      entryId
        ? and(eq(ledgerEntries.organizationId, organizationId), eq(ledgerEntries.id, entryId))
        : eq(ledgerEntries.organizationId, organizationId),
    )
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
    endpoint: row.endpoint,
    consumer_alias: row.consumerAlias,
    consumer_stable_id: row.consumerStableId,
    observation_count: row.observationCount,
    session_count: row.sessionCount,
    owner: row.owner,
    receipt_digest: row.receiptDigest,
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
      const detail = await withTenant(app.database.db, context.organizationId, (tx) =>
        ledgerSelect(tx, context.organizationId, request.params.id),
      );
      const selected = detail.find((item) => item.entry.id === request.params.id);
      if (!selected) throw app.httpErrors.notFound();
      return serializeLedger(selected);
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
