import {
  claimOverrideResponseSchema,
  consumerListResponseSchema,
  ledgerEntrySchema,
  ledgerListResponseSchema,
  overrideDependencyClaimRequestSchema,
  receiptSchema,
} from "@hyrum/contracts";
import {
  and,
  assertions,
  auditEvents,
  behaviorDefinitions,
  behaviorObservations,
  consumers,
  type Database,
  dependencyClaims,
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

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tier: z.enum(["T1", "T2", "T3"]).optional(),
  kind: z.enum(["shape", "ordering", "error", "status"]).optional(),
  state: z.enum(["active", "stale", "dismissed"]).optional(),
  cursor: z.string().max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const consumerQuerySchema = listQuerySchema.pick({ q: true, cursor: true, limit: true });
type Cursor = { seen: string; id: string };

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    return z
      .object({ seen: z.iso.datetime(), id: z.uuid() })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

function ledgerSelect(
  db: Database | TenantDb,
  organizationId: string,
  options: {
    entryId?: string | undefined;
    q?: string | undefined;
    tier?: string | undefined;
    kind?: string | undefined;
    state?: string | undefined;
    cursor?: Cursor | null;
    limit?: number;
  } = {},
) {
  const conditions = [eq(ledgerEntries.organizationId, organizationId)];
  if (options.entryId) conditions.push(eq(ledgerEntries.id, options.entryId));
  if (options.tier) conditions.push(sql`${ledgerEntries.tier} = ${options.tier}`);
  if (options.kind) conditions.push(sql`${behaviorDefinitions.kind} = ${options.kind}`);
  if (options.state) conditions.push(sql`${ledgerEntries.state} = ${options.state}`);
  if (options.q) {
    const query = `%${options.q.toLowerCase()}%`;
    conditions.push(
      sql`lower(${ledgerEntries.title} || ' ' || ${consumers.displayAlias} || ' ' || coalesce(${operations.method}, '') || ' ' || coalesce(${operations.pathTemplate}, '')) like ${query}`,
    );
  }
  if (options.cursor) {
    conditions.push(
      sql`(${ledgerEntries.lastSeenAt}, ${ledgerEntries.id}) < (${new Date(options.cursor.seen)}, ${options.cursor.id}::uuid)`,
    );
  }
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
    .innerJoin(
      behaviorDefinitions,
      and(
        eq(behaviorDefinitions.organizationId, ledgerEntries.organizationId),
        eq(behaviorDefinitions.id, ledgerEntries.behaviorId),
      ),
    )
    .innerJoin(
      consumers,
      and(
        eq(consumers.organizationId, ledgerEntries.organizationId),
        eq(consumers.id, ledgerEntries.consumerId),
      ),
    )
    .leftJoin(
      operations,
      and(
        eq(operations.organizationId, ledgerEntries.organizationId),
        eq(operations.id, ledgerEntries.operationId),
      ),
    )
    .leftJoin(
      receipts,
      and(
        eq(receipts.organizationId, ledgerEntries.organizationId),
        eq(receipts.id, ledgerEntries.receiptId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(ledgerEntries.lastSeenAt), desc(ledgerEntries.id))
    .limit(options.limit ?? 100);
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
        querystring: listQuerySchema,
        response: { 200: ledgerListResponseSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const cursor = decodeCursor(request.query.cursor);
      if (request.query.cursor && !cursor) throw app.httpErrors.badRequest("Invalid cursor");
      const { rows, total } = await withTenant(
        app.database.db,
        context.organizationId,
        async (tx) => {
          const rows = await ledgerSelect(tx, context.organizationId, {
            ...request.query,
            cursor,
            limit: request.query.limit + 1,
          });
          const [count] = await tx
            .select({ value: sql<number>`count(*)::int` })
            .from(ledgerEntries)
            .innerJoin(
              behaviorDefinitions,
              and(
                eq(behaviorDefinitions.organizationId, ledgerEntries.organizationId),
                eq(behaviorDefinitions.id, ledgerEntries.behaviorId),
              ),
            )
            .innerJoin(
              consumers,
              and(
                eq(consumers.organizationId, ledgerEntries.organizationId),
                eq(consumers.id, ledgerEntries.consumerId),
              ),
            )
            .leftJoin(
              operations,
              and(
                eq(operations.organizationId, ledgerEntries.organizationId),
                eq(operations.id, ledgerEntries.operationId),
              ),
            )
            .where(
              and(
                eq(ledgerEntries.organizationId, context.organizationId),
                request.query.tier ? sql`${ledgerEntries.tier} = ${request.query.tier}` : undefined,
                request.query.kind
                  ? sql`${behaviorDefinitions.kind} = ${request.query.kind}`
                  : undefined,
                request.query.state
                  ? sql`${ledgerEntries.state} = ${request.query.state}`
                  : undefined,
                request.query.q
                  ? sql`lower(${ledgerEntries.title} || ' ' || ${consumers.displayAlias} || ' ' || coalesce(${operations.method}, '') || ' ' || coalesce(${operations.pathTemplate}, '')) like ${`%${request.query.q.toLowerCase()}%`}`
                  : undefined,
              ),
            );
          return { rows, total: count?.value ?? 0 };
        },
      );
      const page = rows.slice(0, request.query.limit);
      const last = page.at(-1)?.entry;
      return {
        entries: page.map(serializeLedger),
        total,
        next_cursor:
          rows.length > request.query.limit && last
            ? encodeCursor({ seen: asIso(last.lastSeenAt), id: last.id })
            : null,
      };
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
        ledgerSelect(tx, context.organizationId, { entryId: request.params.id }),
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
        querystring: consumerQuerySchema,
        response: { 200: consumerListResponseSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const cursor = decodeCursor(request.query.cursor);
      if (request.query.cursor && !cursor) throw app.httpErrors.badRequest("Invalid cursor");
      const { rows, total } = await withTenant(
        app.database.db,
        context.organizationId,
        async (tx) => {
          const conditions = [eq(consumers.organizationId, context.organizationId)];
          if (request.query.q)
            conditions.push(
              sql`lower(${consumers.displayAlias} || ' ' || ${consumers.stableId}) like ${`%${request.query.q.toLowerCase()}%`}`,
            );
          if (cursor)
            conditions.push(
              sql`(coalesce(${consumers.lastSeenAt}, 'epoch'::timestamptz), ${consumers.id}) < (${new Date(cursor.seen)}, ${cursor.id}::uuid)`,
            );
          const rows = await tx
            .select()
            .from(consumers)
            .where(and(...conditions))
            .orderBy(desc(consumers.lastSeenAt), desc(consumers.id))
            .limit(request.query.limit + 1);
          const [count] = await tx
            .select({ value: sql<number>`count(*)::int` })
            .from(consumers)
            .where(
              and(
                eq(consumers.organizationId, context.organizationId),
                request.query.q
                  ? sql`lower(${consumers.displayAlias} || ' ' || ${consumers.stableId}) like ${`%${request.query.q.toLowerCase()}%`}`
                  : undefined,
              ),
            );
          return { rows, total: count?.value ?? 0 };
        },
      );
      const page = rows.slice(0, request.query.limit);
      const last = page.at(-1);
      return {
        consumers: page.map((consumer) => ({
          id: consumer.id,
          stable_id: consumer.stableId,
          display_alias: consumer.displayAlias,
          last_seen_at: nullableIso(consumer.lastSeenAt),
        })),
        total,
        next_cursor:
          rows.length > request.query.limit && last
            ? encodeCursor({ seen: asIso(last.lastSeenAt ?? new Date(0)), id: last.id })
            : null,
      };
    },
  );

  app.put(
    "/claims/:id/override",
    {
      preHandler: app.requireHumanPermission("claim:override"),
      schema: {
        tags: ["ledger"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        body: overrideDependencyClaimRequestSchema,
        response: { 200: claimOverrideResponseSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const updated = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [claim] = await tx
          .select()
          .from(dependencyClaims)
          .where(
            and(
              eq(dependencyClaims.organizationId, context.organizationId),
              eq(dependencyClaims.id, request.params.id),
            ),
          )
          .limit(1)
          .for("update");
        if (!claim) throw app.httpErrors.notFound("Claim not found");
        const now = new Date();
        const [row] = await tx
          .update(dependencyClaims)
          .set({
            humanOverrideTier: request.body.tier,
            overriddenBy: request.body.tier ? context.actorId : null,
            overrideReason: request.body.tier ? request.body.reason : null,
            overriddenAt: request.body.tier ? now : null,
            updatedAt: now,
          })
          .where(
            and(
              eq(dependencyClaims.organizationId, context.organizationId),
              eq(dependencyClaims.id, claim.id),
            ),
          )
          .returning();
        const effectiveTier = request.body.tier ?? claim.tier;
        await tx
          .update(ledgerEntries)
          .set({ tier: effectiveTier, updatedAt: now })
          .where(
            and(
              eq(ledgerEntries.organizationId, context.organizationId),
              eq(ledgerEntries.claimId, claim.id),
            ),
          );
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: request.body.tier ? "claim.override" : "claim.override_clear",
          resourceType: "dependency_claim",
          resourceId: claim.id,
          metadata: {
            prior_tier: claim.humanOverrideTier ?? claim.tier,
            effective_tier: effectiveTier,
            reason: request.body.reason,
          },
        });
        return { row, effectiveTier };
      });
      if (!updated.row) throw new Error("Failed to update claim override");
      return {
        claim_id: updated.row.id,
        effective_tier: updated.effectiveTier,
        human_override_tier: updated.row.humanOverrideTier,
        overridden_by: updated.row.overriddenBy,
        override_reason: updated.row.overrideReason,
        overridden_at: updated.row.overriddenAt ? asIso(updated.row.overriddenAt) : null,
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
