import { apiSpecSchema, uploadApiSpecRequestSchema } from "@hyrum/contracts";
import { and, apiSpecs, eq, operations, withTenant } from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { normalizeOpenApiSpec } from "../../domain/openapi";
import { sha256Hex, stableStringify } from "../../domain/security";
import { requireContext } from "./helpers";

export const specRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/api-specs",
    {
      preHandler: app.requireHumanPermission("integration:manage"),
      schema: {
        tags: ["api-specs"],
        security: [{ bearerAuth: [] }],
        body: uploadApiSpecRequestSchema,
        response: { 201: apiSpecSchema },
      },
    },
    async (request, reply) => {
      const context = requireContext(app, request.authContext);
      let normalized: ReturnType<typeof normalizeOpenApiSpec>;
      try {
        normalized = normalizeOpenApiSpec(request.body.document);
      } catch (error) {
        throw app.httpErrors.unprocessableEntity(
          error instanceof Error ? error.message : "OpenAPI document could not be normalized",
        );
      }
      const sha256 = sha256Hex(request.body.document);
      const digest = `sha256:${sha256}`;
      const storedDocument = await app.objectStorage.putObject({
        organizationId: context.organizationId,
        kind: "spec",
        body: stableStringify(request.body.document),
        contentType: "application/json",
        expectedSha256: sha256,
      });

      const spec = await withTenant(app.database.db, context.organizationId, async (tx) => {
        if (request.body.active) {
          await tx
            .update(apiSpecs)
            .set({ active: false })
            .where(
              and(eq(apiSpecs.organizationId, context.organizationId), eq(apiSpecs.active, true)),
            );
        }

        const [row] = await tx
          .insert(apiSpecs)
          .values({
            organizationId: context.organizationId,
            version: request.body.version,
            objectKey: storedDocument.key,
            digest,
            normalized,
            active: request.body.active,
            uploadedBy: context.actorId,
          })
          .onConflictDoUpdate({
            target: [apiSpecs.organizationId, apiSpecs.version],
            set: {
              objectKey: storedDocument.key,
              digest,
              normalized,
              active: request.body.active,
              updatedAt: new Date(),
            },
          })
          .returning();

        if (!row) throw new Error("Failed to store API spec");

        for (const operation of normalized.operations) {
          await tx
            .insert(operations)
            .values({
              organizationId: context.organizationId,
              apiSpecId: row.id,
              method: operation.method,
              pathTemplate: operation.path_template,
              operationId: operation.operation_id,
            })
            .onConflictDoUpdate({
              target: [operations.organizationId, operations.method, operations.pathTemplate],
              set: {
                apiSpecId: row.id,
                operationId: operation.operation_id,
                updatedAt: new Date(),
              },
            });
        }
        return row;
      });

      if (!spec) throw new Error("Failed to store API spec");
      return reply.code(201).send({
        id: spec.id,
        version: spec.version,
        digest: spec.digest,
        active: spec.active,
      });
    },
  );
};
