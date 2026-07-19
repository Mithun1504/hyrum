import {
  corpusItemSchema,
  createCorpusItemRequestSchema,
  createReplayCorpusRequestSchema,
  prepareCorpusUploadRequestSchema,
  prepareCorpusUploadResponseSchema,
  replayCorpusSchema,
  updateCorpusItemRequestSchema,
  updateReplayCorpusRequestSchema,
} from "@hyrum/contracts";
import { and, auditEvents, corpusItems, desc, eq, replayCorpora, withTenant } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireContext } from "./helpers";

const params = z.object({ id: z.uuid() });
const itemParams = z.object({ id: z.uuid(), itemId: z.uuid() });
const listResponse = z.object({ corpora: z.array(replayCorpusSchema) });

async function verifyStoredArtifact(
  app: Parameters<FastifyPluginAsyncZod>[0],
  organizationId: string,
  key: string,
  digest?: string | null,
) {
  try {
    const object = await app.objectStorage.headObject({ organizationId, key });
    if (!object) throw app.httpErrors.unprocessableEntity(`Stored artifact ${key} was not found`);
    if (digest && `sha256:${object.sha256}` !== digest) {
      throw app.httpErrors.unprocessableEntity(`Stored artifact ${key} does not match its digest`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw app.httpErrors.badRequest("Object key is not a tenant-scoped content-addressed key");
  }
}

function serializeItem(row: typeof corpusItems.$inferSelect) {
  return corpusItemSchema.parse({
    id: row.id,
    corpus_id: row.corpusId,
    case_id: row.caseId,
    operation_id: row.operationId,
    consumer_id: row.consumerId,
    coverage_class: row.coverageClass,
    object_key: row.objectKey,
    digest: row.digest,
    enabled: row.enabled,
    priority: row.priority,
    request_metadata: row.requestMetadata,
  });
}

function serializeCorpus(
  row: typeof replayCorpora.$inferSelect,
  items: (typeof corpusItems.$inferSelect)[],
) {
  return replayCorpusSchema.parse({
    id: row.id,
    version: row.version,
    digest: row.digest,
    object_key: row.objectKey,
    fixture_digest: row.fixtureDigest,
    fixture_object_key: row.fixtureObjectKey,
    stubs_object_key: row.stubsObjectKey,
    curation_status: row.curationStatus,
    created_by: row.createdBy,
    items: items.map(serializeItem),
  });
}

export const corpusRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/replay/corpora/uploads",
    {
      preHandler: app.requireHumanPermission("corpus:manage"),
      schema: {
        tags: ["replay", "corpus"],
        security: [{ bearerAuth: [] }],
        body: prepareCorpusUploadRequestSchema,
        response: { 201: prepareCorpusUploadResponseSchema },
      },
    },
    async (request, reply) => {
      const context = requireContext(app, request.authContext);
      const expiresInSeconds = 300;
      const upload = await app.objectStorage.presignWrite({
        organizationId: context.organizationId,
        kind: "corpus",
        sha256: request.body.sha256.slice("sha256:".length),
        sizeBytes: request.body.size_bytes,
        contentType: request.body.content_type,
        expiresInSeconds,
      });
      return reply.code(201).send({
        object_key: upload.key,
        upload_url: upload.url,
        headers: upload.headers,
        expires_at: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
      });
    },
  );

  app.get(
    "/replay/corpora",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["replay", "corpus"],
        security: [{ bearerAuth: [] }],
        response: { 200: listResponse },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const result = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const corpora = await tx
          .select()
          .from(replayCorpora)
          .where(eq(replayCorpora.organizationId, context.organizationId))
          .orderBy(desc(replayCorpora.createdAt));
        const items = await tx
          .select()
          .from(corpusItems)
          .where(eq(corpusItems.organizationId, context.organizationId))
          .orderBy(corpusItems.priority, corpusItems.caseId);
        return { corpora, items };
      });
      return {
        corpora: result.corpora.map((corpus) =>
          serializeCorpus(
            corpus,
            result.items.filter((item) => item.corpusId === corpus.id),
          ),
        ),
      };
    },
  );

  app.post(
    "/replay/corpora",
    {
      preHandler: app.requireHumanPermission("corpus:manage"),
      schema: {
        tags: ["replay", "corpus"],
        security: [{ bearerAuth: [] }],
        body: createReplayCorpusRequestSchema,
        response: { 201: replayCorpusSchema },
      },
    },
    async (request, reply) => {
      const context = requireContext(app, request.authContext);
      await verifyStoredArtifact(
        app,
        context.organizationId,
        request.body.object_key,
        request.body.digest,
      );
      if (request.body.fixture_object_key) {
        await verifyStoredArtifact(
          app,
          context.organizationId,
          request.body.fixture_object_key,
          request.body.fixture_digest,
        );
      }
      if (request.body.stubs_object_key) {
        await verifyStoredArtifact(app, context.organizationId, request.body.stubs_object_key);
      }
      const row = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [created] = await tx
          .insert(replayCorpora)
          .values({
            organizationId: context.organizationId,
            version: request.body.version,
            digest: request.body.digest,
            objectKey: request.body.object_key,
            fixtureDigest: request.body.fixture_digest,
            fixtureObjectKey: request.body.fixture_object_key,
            stubsObjectKey: request.body.stubs_object_key,
            createdBy: context.actorId,
          })
          .returning();
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: "corpus.create",
          resourceType: "replay_corpus",
          resourceId: created?.id,
          metadata: { digest: request.body.digest },
        });
        return created;
      });
      if (!row) throw new Error("Failed to create corpus");
      return reply.code(201).send(serializeCorpus(row, []));
    },
  );

  app.post(
    "/replay/corpora/:id/items",
    {
      preHandler: app.requireHumanPermission("corpus:manage"),
      schema: {
        tags: ["replay", "corpus"],
        security: [{ bearerAuth: [] }],
        params,
        body: createCorpusItemRequestSchema,
        response: { 201: corpusItemSchema },
      },
    },
    async (request, reply) => {
      const context = requireContext(app, request.authContext);
      await verifyStoredArtifact(
        app,
        context.organizationId,
        request.body.object_key,
        request.body.digest,
      );
      const row = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [corpus] = await tx
          .select()
          .from(replayCorpora)
          .where(
            and(
              eq(replayCorpora.organizationId, context.organizationId),
              eq(replayCorpora.id, request.params.id),
            ),
          )
          .limit(1)
          .for("update");
        if (!corpus) throw app.httpErrors.notFound("Corpus not found");
        if (corpus.curationStatus !== "draft")
          throw app.httpErrors.conflict("Only draft corpora can be edited");
        const [created] = await tx
          .insert(corpusItems)
          .values({
            organizationId: context.organizationId,
            corpusId: corpus.id,
            caseId: request.body.case_id,
            operationId: request.body.operation_id,
            consumerId: request.body.consumer_id,
            coverageClass: request.body.coverage_class,
            objectKey: request.body.object_key,
            digest: request.body.digest,
            enabled: request.body.enabled,
            priority: request.body.priority,
            requestMetadata: request.body.request_metadata,
          })
          .returning();
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: "corpus.item_create",
          resourceType: "corpus_item",
          resourceId: created?.id,
          metadata: { corpus_id: corpus.id, case_id: request.body.case_id },
        });
        return created;
      });
      if (!row) throw new Error("Failed to create corpus item");
      return reply.code(201).send(serializeItem(row));
    },
  );

  app.patch(
    "/replay/corpora/:id/items/:itemId",
    {
      preHandler: app.requireHumanPermission("corpus:manage"),
      schema: {
        tags: ["replay", "corpus"],
        security: [{ bearerAuth: [] }],
        params: itemParams,
        body: updateCorpusItemRequestSchema,
        response: { 200: corpusItemSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const row = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [corpus] = await tx
          .select({ status: replayCorpora.curationStatus })
          .from(replayCorpora)
          .where(
            and(
              eq(replayCorpora.organizationId, context.organizationId),
              eq(replayCorpora.id, request.params.id),
            ),
          )
          .limit(1)
          .for("update");
        if (!corpus) throw app.httpErrors.notFound("Corpus not found");
        if (corpus.status !== "draft")
          throw app.httpErrors.conflict("Only draft corpora can be edited");
        const [updated] = await tx
          .update(corpusItems)
          .set({ ...request.body, updatedAt: new Date() })
          .where(
            and(
              eq(corpusItems.organizationId, context.organizationId),
              eq(corpusItems.corpusId, request.params.id),
              eq(corpusItems.id, request.params.itemId),
            ),
          )
          .returning();
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: "corpus.item_update",
          resourceType: "corpus_item",
          resourceId: request.params.itemId,
          metadata: {
            corpus_id: request.params.id,
            fields: Object.keys(request.body).sort(),
          },
        });
        return updated;
      });
      if (!row) throw app.httpErrors.notFound("Corpus item not found");
      return serializeItem(row);
    },
  );

  app.patch(
    "/replay/corpora/:id",
    {
      preHandler: app.requireHumanPermission("corpus:manage"),
      schema: {
        tags: ["replay", "corpus"],
        security: [{ bearerAuth: [] }],
        params,
        body: updateReplayCorpusRequestSchema,
        response: { 200: replayCorpusSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const result = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [current] = await tx
          .select()
          .from(replayCorpora)
          .where(
            and(
              eq(replayCorpora.organizationId, context.organizationId),
              eq(replayCorpora.id, request.params.id),
            ),
          )
          .limit(1)
          .for("update");
        if (!current) throw app.httpErrors.notFound("Corpus not found");
        const allowedTransitions =
          current.curationStatus === "draft"
            ? new Set(["ready", "archived"])
            : current.curationStatus === "ready"
              ? new Set(["archived"])
              : new Set<string>();
        if (!allowedTransitions.has(request.body.curation_status))
          throw app.httpErrors.conflict(
            `Corpus cannot transition from ${current.curationStatus} to ${request.body.curation_status}`,
          );
        const items = await tx
          .select()
          .from(corpusItems)
          .where(
            and(
              eq(corpusItems.organizationId, context.organizationId),
              eq(corpusItems.corpusId, current.id),
            ),
          );
        if (
          request.body.curation_status === "ready" &&
          (!current.fixtureDigest ||
            !current.fixtureObjectKey ||
            !items.some((item) => item.enabled))
        )
          throw app.httpErrors.unprocessableEntity(
            "A ready corpus requires fixtures and at least one enabled case",
          );
        if (request.body.curation_status === "ready") {
          await verifyStoredArtifact(
            app,
            context.organizationId,
            current.objectKey,
            current.digest,
          );
          await verifyStoredArtifact(
            app,
            context.organizationId,
            current.fixtureObjectKey as string,
            current.fixtureDigest,
          );
          if (current.stubsObjectKey) {
            await verifyStoredArtifact(app, context.organizationId, current.stubsObjectKey);
          }
          for (const item of items.filter((candidate) => candidate.enabled)) {
            await verifyStoredArtifact(app, context.organizationId, item.objectKey, item.digest);
          }
        }
        const [updated] = await tx
          .update(replayCorpora)
          .set({
            curationStatus: request.body.curation_status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(replayCorpora.organizationId, context.organizationId),
              eq(replayCorpora.id, current.id),
            ),
          )
          .returning();
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: "corpus.status",
          resourceType: "replay_corpus",
          resourceId: current.id,
          metadata: request.body,
        });
        return { updated, items };
      });
      if (!result.updated) throw new Error("Failed to update corpus");
      return serializeCorpus(result.updated, result.items);
    },
  );
};
