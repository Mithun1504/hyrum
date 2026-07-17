import {
  servicePathParamsSchema,
  specificationUploadResponseSchema,
  uploadSpecificationRequestSchema,
} from "@hyrum/contracts";
import { findApiSpecificationByDigest, getApiService, persistApiSpecification } from "@hyrum/db";
import { normalizeSpecification, SpecificationValidationError } from "@hyrum/specs";
import type { StoredObjectResult } from "@hyrum/storage";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

function serializeSpecification(result: Awaited<ReturnType<typeof persistApiSpecification>>) {
  return {
    created: result.created,
    specification: {
      ...result.specification,
      createdAt: result.specification.createdAt.toISOString(),
    },
  };
}

export const specificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/services/:identifier/specifications",
    {
      bodyLimit: 2_200_000,
      preHandler: app.requirePermission("spec:manage"),
      schema: {
        tags: ["specifications"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        body: uploadSpecificationRequestSchema,
        response: {
          200: specificationUploadResponseSchema,
          201: specificationUploadResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");

      let normalized: Awaited<ReturnType<typeof normalizeSpecification>>;
      try {
        normalized = await normalizeSpecification(request.body.document);
      } catch (error) {
        if (error instanceof SpecificationValidationError) {
          throw app.httpErrors.unprocessableEntity(
            [error.message, ...error.issues].filter(Boolean).join(": "),
          );
        }
        throw error;
      }
      const existing = await findApiSpecificationByDigest(
        app.database.db,
        context.organizationId,
        service.id,
        normalized.normalizedDigest,
      );
      if (existing) {
        return reply.send(
          serializeSpecification({
            created: false,
            specification: existing,
            retainedObjectKeys: [],
          }),
        );
      }

      const uploaded: StoredObjectResult[] = [];
      try {
        const original = await app.objectStorage.put({
          organizationId: context.organizationId,
          purpose: "api-spec",
          body: normalized.originalBytes,
          contentType: "application/yaml",
        });
        uploaded.push(original);
        await app.objectStorage.verify(original);
        const normalizedObject =
          normalized.originalDigest === normalized.normalizedDigest
            ? original
            : await app.objectStorage.put({
                organizationId: context.organizationId,
                purpose: "api-spec",
                body: normalized.normalizedBytes,
                contentType: "application/json",
              });
        if (normalizedObject !== original) {
          uploaded.push(normalizedObject);
          await app.objectStorage.verify(normalizedObject);
        }
        const result = await persistApiSpecification(
          app.database.db,
          context.organizationId,
          service.id,
          {
            userId: context.actor.actorId,
            membershipId: context.actor.membershipId,
            requestId: request.id,
          },
          {
            versionLabel: request.body.versionLabel,
            originalDigest: normalized.originalDigest,
            normalizedDigest: normalized.normalizedDigest,
            openapiVersion: normalized.openapiVersion,
            operations: normalized.operations,
          },
          original,
          normalizedObject,
        );
        const retained = new Set(result.retainedObjectKeys);
        await Promise.all(
          uploaded
            .filter(({ objectKey }) => !retained.has(objectKey))
            .map(({ objectKey }) =>
              app.objectStorage.delete(context.organizationId, objectKey).catch((cleanupError) => {
                request.log.error(
                  { err: cleanupError },
                  "orphaned specification object cleanup failed",
                );
              }),
            ),
        );
        return reply.code(result.created ? 201 : 200).send(serializeSpecification(result));
      } catch (error) {
        await Promise.all(
          uploaded.map(({ objectKey }) =>
            app.objectStorage.delete(context.organizationId, objectKey).catch((cleanupError) => {
              request.log.error({ err: cleanupError }, "failed specification upload cleanup");
            }),
          ),
        );
        throw error;
      }
    },
  );
};
