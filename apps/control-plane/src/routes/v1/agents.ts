import { createHash } from "node:crypto";
import {
  agentConfigurationSchema,
  agentHeartbeatRequestSchema,
  agentHeartbeatResponseSchema,
  agentListSchema,
  agentRegistrationDefaultsSchema,
  createAgentRequestSchema,
  createAgentResponseSchema,
  ingestionBatchRequestSchema,
  ingestionBatchResponseSchema,
  issuedMachineCredentialSchema,
  processedCaptureSessionSchema,
  rotateAgentCredentialRequestSchema,
  servicePathParamsSchema,
} from "@hyrum/contracts";
import {
  createAgent,
  findIngestionBatch,
  getAgentConfiguration,
  getAgentRegistrationDefaults,
  getApiService,
  listAgents,
  persistIngestionBatch,
  recordAgentHeartbeat,
  revokeAgent,
  rotateAgentCredential,
} from "@hyrum/db";
import type { StoredObjectResult } from "@hyrum/storage";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { deriveAgentKey } from "../../lib/agent-keys";
import { issueMachineToken } from "../../lib/machine-token";

function serializeAgent(agent: Awaited<ReturnType<typeof listAgents>>[number]) {
  return {
    ...agent,
    lastSeenAt: agent.lastSeenAt?.toISOString() ?? null,
    revokedAt: agent.revokedAt?.toISOString() ?? null,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

function expiresAt(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
}

export const agentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/agent-registration-defaults",
    {
      preHandler: app.requirePermission("agent:read"),
      schema: {
        tags: ["agents"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: agentRegistrationDefaultsSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      const defaults = await getAgentRegistrationDefaults(
        app.database.db,
        context.organizationId,
        service.id,
      );
      if (!defaults) throw app.httpErrors.conflict("Active capture policies are not configured");
      return defaults;
    },
  );
  app.get(
    "/services/:identifier/agents",
    {
      preHandler: app.requirePermission("agent:read"),
      schema: {
        tags: ["agents"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: agentListSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      const records = await listAgents(app.database.db, context.organizationId, service.id);
      return { data: records.map(serializeAgent) };
    },
  );

  app.post(
    "/services/:identifier/agents",
    {
      preHandler: app.requirePermission("agent:manage", { recentAuth: true }),
      schema: {
        tags: ["agents"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        body: createAgentRequestSchema,
        response: { 201: createAgentResponseSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      const configuredPepper = app.machineTokenPepper;
      if (!context || !configuredPepper) {
        throw app.httpErrors.serviceUnavailable("Machine credential issuance is not configured");
      }
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      const token = await issueMachineToken(configuredPepper);
      const expiry = expiresAt(request.body.credentialExpiresInDays);
      try {
        const created = await createAgent(
          app.database.db,
          context.organizationId,
          service.id,
          { userId: context.actor.actorId, requestId: request.id },
          request.body,
          { tokenPrefix: token.tokenPrefix, tokenHash: token.tokenHash, expiresAt: expiry },
        );
        return reply.code(201).send({
          agent: serializeAgent(created.agent),
          credential: {
            id: created.credentialId,
            token: token.token,
            tokenPrefix: token.tokenPrefix,
            scopes: ["config:read", "heartbeat:write", "ingestion:write"],
            expiresAt: expiry.toISOString(),
          },
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw app.httpErrors.conflict("An agent with this external instance key already exists");
        }
        if (error instanceof Error && error.message.startsWith("Agent configuration")) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        if (error instanceof Error && error.message.startsWith("Agent registration requires")) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        throw error;
      }
    },
  );

  app.post(
    "/services/:identifier/agents/:agentId/credentials",
    {
      preHandler: app.requirePermission("agent:manage", { recentAuth: true }),
      schema: {
        tags: ["agents"],
        security: [{ bearerAuth: [] }],
        params: z.strictObject({ identifier: z.string().min(1).max(100), agentId: z.uuid() }),
        body: rotateAgentCredentialRequestSchema,
        response: { 201: issuedMachineCredentialSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      const pepper = app.machineTokenPepper;
      if (!context || !pepper)
        throw app.httpErrors.serviceUnavailable("Machine credential issuance is not configured");
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      const serviceAgents = await listAgents(app.database.db, context.organizationId, service.id);
      if (!serviceAgents.some(({ id }) => id === request.params.agentId))
        throw app.httpErrors.notFound("Agent not found");
      const token = await issueMachineToken(pepper);
      const expiry = expiresAt(request.body.expiresInDays);
      const id = await rotateAgentCredential(
        app.database.db,
        context.organizationId,
        request.params.agentId,
        { userId: context.actor.actorId, requestId: request.id },
        { tokenPrefix: token.tokenPrefix, tokenHash: token.tokenHash, expiresAt: expiry },
      );
      return reply.code(201).send({
        id,
        token: token.token,
        tokenPrefix: token.tokenPrefix,
        scopes: ["config:read", "heartbeat:write", "ingestion:write"],
        expiresAt: expiry.toISOString(),
      });
    },
  );

  app.delete(
    "/services/:identifier/agents/:agentId",
    {
      preHandler: app.requirePermission("agent:manage", { recentAuth: true }),
      schema: {
        tags: ["agents"],
        security: [{ bearerAuth: [] }],
        params: z.strictObject({ identifier: z.string().min(1).max(100), agentId: z.uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      const serviceAgents = await listAgents(app.database.db, context.organizationId, service.id);
      if (!serviceAgents.some(({ id }) => id === request.params.agentId))
        throw app.httpErrors.notFound("Agent not found");
      const revoked = await revokeAgent(
        app.database.db,
        context.organizationId,
        request.params.agentId,
        {
          userId: context.actor.actorId,
          requestId: request.id,
        },
      );
      if (!revoked) throw app.httpErrors.notFound("Agent not found");
      return reply.code(204).send(null);
    },
  );

  app.get(
    "/agent/configuration",
    {
      preHandler: app.authenticateMachine("config:read"),
      schema: {
        tags: ["agent-machine"],
        security: [{ bearerAuth: [] }],
        response: { 200: agentConfigurationSchema },
      },
    },
    async (request) => {
      const principal = request.machineCredential;
      if (!principal) throw app.httpErrors.unauthorized();
      const configuration = await getAgentConfiguration(app.database.db, principal);
      if (!configuration) throw app.httpErrors.notFound("Agent configuration not found");
      const derivationSecret = app.runtimeEnv.AGENT_KEY_DERIVATION_SECRET;
      if (!derivationSecret) {
        throw app.httpErrors.serviceUnavailable("Agent key delivery is not configured");
      }
      return {
        ...configuration,
        keys: {
          structural: {
            versionId: configuration.keyVersionIds.structural,
            material: deriveAgentKey(
              derivationSecret,
              principal.organizationId,
              `structural:${configuration.keyVersionIds.structural}`,
            ),
          },
          consumerIdentity: {
            versionId: configuration.keyVersionIds.consumerIdentity,
            material: deriveAgentKey(
              derivationSecret,
              principal.organizationId,
              `consumer:${configuration.keyVersionIds.consumerIdentity}`,
            ),
          },
          sampling: {
            policyVersionId: configuration.sampling.id,
            material: deriveAgentKey(
              derivationSecret,
              principal.organizationId,
              `sampling:${configuration.sampling.id}`,
            ),
          },
        },
      };
    },
  );

  app.post(
    "/agent/heartbeat",
    {
      preHandler: app.authenticateMachine("heartbeat:write"),
      schema: {
        tags: ["agent-machine"],
        security: [{ bearerAuth: [] }],
        body: agentHeartbeatRequestSchema,
        response: { 200: agentHeartbeatResponseSchema },
      },
    },
    async (request) => {
      const principal = request.machineCredential;
      if (!principal) throw app.httpErrors.unauthorized();
      const configRevision = await recordAgentHeartbeat(app.database.db, principal, {
        agentVersion: request.body.agentVersion,
        status: request.body.status,
        ...(request.body.errorCode !== undefined ? { errorCode: request.body.errorCode } : {}),
      });
      if (configRevision === null) throw app.httpErrors.notFound("Agent not found");
      return {
        accepted: true as const,
        configRevision,
        configurationChanged: request.body.configRevision !== configRevision,
      };
    },
  );

  app.post(
    "/agent/ingestion-batches",
    {
      bodyLimit: 16 * 1_024 * 1_024,
      config: { rawBody: true, rateLimit: { max: 60, timeWindow: "1 minute" } },
      preHandler: app.authenticateMachine("ingestion:write"),
      schema: {
        tags: ["agent-machine"],
        security: [{ bearerAuth: [] }],
        headers: z.object({
          "x-hyrum-content-sha256": z.string().regex(/^[0-9a-f]{64}$/),
        }),
        body: ingestionBatchRequestSchema,
        response: { 200: ingestionBatchResponseSchema, 202: ingestionBatchResponseSchema },
      },
    },
    async (request, reply) => {
      const principal = request.machineCredential;
      if (!principal) throw app.httpErrors.unauthorized();
      const rawBody = request.rawBody;
      if (typeof rawBody !== "string")
        throw app.httpErrors.badRequest("Raw request body is unavailable");
      const payloadDigest = createHash("sha256").update(rawBody).digest("hex");
      if (payloadDigest !== request.headers["x-hyrum-content-sha256"]) {
        throw app.httpErrors.badRequest("Content digest does not match the request body");
      }
      const duplicate = await findIngestionBatch(
        app.database.db,
        principal,
        request.body.agentBatchId,
      );
      if (duplicate) return reply.send(duplicate);

      const accepted = [];
      const rejections: Array<{ index: number; code: string; detail: string }> = [];
      for (const [index, candidate] of request.body.sessions.entries()) {
        const parsed = processedCaptureSessionSchema.safeParse(candidate);
        if (!parsed.success) {
          rejections.push({
            index,
            code: "invalid_redacted_session",
            detail: parsed.error.issues[0]?.message.slice(0, 300) ?? "Session validation failed",
          });
          continue;
        }
        if (
          parsed.data.schema_version !== request.body.schemaVersion ||
          parsed.data.extraction.schema_version !== request.body.schemaVersion
        ) {
          rejections.push({
            index,
            code: "schema_version_mismatch",
            detail: "Session schema version does not match the batch",
          });
          continue;
        }
        accepted.push(parsed.data);
      }
      if (accepted.length === 0) {
        throw app.httpErrors.unprocessableEntity("Every session in the batch was rejected");
      }

      const acceptedBytes = Buffer.from(
        JSON.stringify({
          schemaVersion: request.body.schemaVersion,
          extractorReleaseId: request.body.extractorReleaseId,
          redactionPolicyVersionId: request.body.redactionPolicyVersionId,
          samplingPolicyVersionId: request.body.samplingPolicyVersionId,
          sessions: accepted,
        }),
      );
      const uploaded: StoredObjectResult[] = [];
      try {
        const captureObject = await app.objectStorage.put({
          organizationId: principal.organizationId,
          purpose: "capture-batch",
          body: acceptedBytes,
          contentType: "application/json",
        });
        uploaded.push(captureObject);
        await app.objectStorage.verify(captureObject);
        const rejectionObject =
          rejections.length > 0
            ? await app.objectStorage.put({
                organizationId: principal.organizationId,
                purpose: "generated-artifact",
                body: Buffer.from(JSON.stringify({ rejections: rejections.slice(0, 100) })),
                contentType: "application/json",
              })
            : null;
        if (rejectionObject) {
          uploaded.push(rejectionObject);
          await app.objectStorage.verify(rejectionObject);
        }
        const result = await persistIngestionBatch(
          app.database.db,
          principal,
          {
            agentBatchId: request.body.agentBatchId,
            payloadDigest,
            schemaVersion: request.body.schemaVersion,
            extractorReleaseId: request.body.extractorReleaseId,
            redactionPolicyVersionId: request.body.redactionPolicyVersionId,
            samplingPolicyVersionId: request.body.samplingPolicyVersionId,
            acceptedItemCount: accepted.length,
            rejectedItemCount: rejections.length,
            rejections: rejections.slice(0, 100),
          },
          captureObject,
          rejectionObject,
        );
        const retained = new Set(result.retainedObjectKeys);
        await Promise.all(
          uploaded
            .filter(({ objectKey }) => !retained.has(objectKey))
            .map(({ objectKey }) => app.objectStorage.delete(principal.organizationId, objectKey)),
        );
        return reply.code(result.duplicate ? 200 : 202).send(result);
      } catch (error) {
        await Promise.all(
          uploaded.map(({ objectKey }) =>
            app.objectStorage.delete(principal.organizationId, objectKey).catch(() => undefined),
          ),
        );
        if (
          error instanceof Error &&
          error.message.includes("already used with different content")
        ) {
          throw app.httpErrors.conflict(error.message);
        }
        if (error instanceof Error && error.message.includes("configuration")) {
          throw app.httpErrors.conflict(error.message);
        }
        throw error;
      }
    },
  );
};
