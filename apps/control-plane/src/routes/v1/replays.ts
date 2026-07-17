import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import {
  advisoryRunSchema,
  createReplayRunRequestSchema,
  createReplayRunResponseSchema,
  githubActionReplayRequestSchema,
  replayImpactExplanationResponseSchema,
  replayReportAcceptedSchema,
  replayReportSchema,
  replayRunDetailSchema,
  replayRunListSchema,
  replayRunPathParamsSchema,
  servicePathParamsSchema,
  uploadReplayReportRequestSchema,
} from "@hyrum/contracts";
import {
  authorizeReplayCorpusRead,
  createReplayRun,
  getApiService,
  getReplayImpactExplanation,
  getReplayRunDetail,
  getReplayRunInputs,
  listReplayRuns,
  persistReplayReport,
  ReplayRunError,
  requestReplayImpactExplanation,
  resolveGitHubActionConnection,
} from "@hyrum/db";
import {
  REPLAY_IMPACT_PROMPT_DIGEST,
  REPLAY_IMPACT_PROMPT_VERSION,
  REPLAY_IMPACT_SCHEMA_DIGEST,
} from "@hyrum/openai";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { issueRunnerToken } from "../../lib/machine-token";

const githubActionsJwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);
const githubActionsClaimsSchema = z.object({
  sub: z.string().endsWith(":pull_request"),
  repository_id: z.string().regex(/^\d+$/),
  repository: z.string().min(3),
  event_name: z.literal("pull_request"),
  actor: z.string().min(1),
  sha: z.string().regex(/^[0-9a-f]{40}$/i),
});

function serializeRun(
  run:
    | Awaited<ReturnType<typeof listReplayRuns>>[number]
    | Awaited<ReturnType<typeof createReplayRun>>,
) {
  const gateDecision = "gateDecision" in run ? run.gateDecision : null;
  return {
    ...run,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    gateDecision: gateDecision
      ? { ...gateDecision, evaluatedAt: gateDecision.evaluatedAt.toISOString() }
      : null,
  };
}

function validateSigningKey(value: string): void {
  try {
    const key = createPublicKey({ key: Buffer.from(value, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Unexpected key type");
  } catch {
    throw new TypeError("reportSigningPublicKey must be a base64 Ed25519 SPKI public key");
  }
}

export const replayRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/github-actions/replays",
    {
      schema: {
        tags: ["replays", "github-actions"],
        security: [{ bearerAuth: [] }],
        body: githubActionReplayRequestSchema,
        response: { 201: createReplayRunResponseSchema },
      },
    },
    async (request, reply) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized();
      if (!app.machineTokenPepper) {
        throw app.httpErrors.serviceUnavailable("Runner authentication is not configured");
      }
      let claims: z.infer<typeof githubActionsClaimsSchema>;
      try {
        const verified = await jwtVerify(authorization.slice("Bearer ".length), githubActionsJwks, {
          issuer: "https://token.actions.githubusercontent.com",
          audience: app.runtimeEnv.GITHUB_ACTIONS_OIDC_AUDIENCE,
        });
        claims = githubActionsClaimsSchema.parse(verified.payload);
      } catch {
        throw app.httpErrors.unauthorized("GitHub Actions OIDC token is invalid");
      }
      const connection = await resolveGitHubActionConnection(
        app.database.db,
        BigInt(claims.repository_id),
        request.body.serviceSlug,
      );
      if (!connection || connection.repositoryFullName !== claims.repository) {
        throw app.httpErrors.forbidden("This repository is not connected to the requested service");
      }
      try {
        validateSigningKey(request.body.reportSigningPublicKey);
        const issued = await issueRunnerToken(app.machineTokenPepper);
        const expiresAt = new Date(Date.now() + 15 * 60_000);
        const nonce = randomBytes(32).toString("base64url");
        const nonceDigest = createHash("sha256").update(nonce).digest("hex");
        const run = await createReplayRun(
          app.database.db,
          connection.organizationId,
          connection.apiServiceId,
          { userId: `github:${claims.actor}`, requestId: request.id },
          {
            replayCorpusId: request.body.replayCorpusId,
            baseImageDigest: request.body.baseImageDigest,
            candidateImageDigest: request.body.candidateImageDigest,
            triggerIdempotencyKey: request.body.triggerIdempotencyKey,
            runnerVersion: request.body.runnerVersion,
            reportSigningPublicKey: request.body.reportSigningPublicKey,
            signingKeyId: request.body.signingKeyId,
            repositoryConnectionId: connection.repositoryConnectionId,
            pullRequestNumber: request.body.pullRequestNumber,
          },
          { tokenPrefix: issued.tokenPrefix, tokenHash: issued.tokenHash, expiresAt, nonceDigest },
        );
        const corpus = await authorizeReplayCorpusRead(
          app.database.db,
          connection.organizationId,
          run.replayCorpusId,
          { userId: `github:${claims.actor}`, requestId: request.id },
        );
        if (!corpus || corpus.bucket !== app.objectStorage.bucket) {
          throw new Error("Replay corpus storage is unavailable");
        }
        const corpusUrlExpiresIn = 300;
        const corpusUrl = await app.objectStorage.signedReadUrl(
          connection.organizationId,
          corpus.objectKey,
          corpusUrlExpiresIn,
        );
        const inputs = await getReplayRunInputs(app.database.db, connection.organizationId, run.id);
        if (!inputs) throw new Error("Replay immutable inputs are unavailable");
        return reply.code(201).send({
          run: serializeRun(run),
          runnerCredential: {
            token: issued.token,
            nonce,
            expiresAt: expiresAt.toISOString(),
            corpusUrl,
            corpusUrlExpiresAt: new Date(Date.now() + corpusUrlExpiresIn * 1_000).toISOString(),
            nonceDigest,
            reportUploadPath: `/v1/runner/replays/${run.id}/report`,
            ...inputs,
          },
        });
      } catch (error) {
        if (error instanceof ReplayRunError && error.code === "not_found") {
          throw app.httpErrors.notFound(error.message);
        }
        if (error instanceof ReplayRunError && error.code === "conflict") {
          throw app.httpErrors.conflict(error.message);
        }
        if (error instanceof ReplayRunError || error instanceof TypeError) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        throw error;
      }
    },
  );

  app.get(
    "/services/:identifier/replays",
    {
      preHandler: app.requirePermission("replay:read"),
      schema: {
        tags: ["replays"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: replayRunListSchema },
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
      const runs = await listReplayRuns(app.database.db, context.organizationId, service.id);
      return { data: runs.map(serializeRun) };
    },
  );

  app.get(
    "/services/:identifier/replays/:replayRunId/explanation",
    {
      preHandler: app.requirePermission("replay:read"),
      schema: {
        tags: ["replays", "ai"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema.extend(replayRunPathParamsSchema.shape),
        response: { 200: replayImpactExplanationResponseSchema },
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
      const explanation = await getReplayImpactExplanation(
        app.database.db,
        context.organizationId,
        service.id,
        request.params.replayRunId,
      );
      return {
        data: explanation
          ? { ...explanation, createdAt: explanation.createdAt.toISOString() }
          : null,
      };
    },
  );

  app.post(
    "/services/:identifier/replays/:replayRunId/explanation",
    {
      preHandler: app.requirePermission("replay:run"),
      schema: {
        tags: ["replays", "ai"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema.extend(replayRunPathParamsSchema.shape),
        response: { 202: advisoryRunSchema },
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
      try {
        const run = await requestReplayImpactExplanation(
          app.database.db,
          context.organizationId,
          service.id,
          request.params.replayRunId,
          { userId: context.actor.actorId, requestId: request.id },
          {
            version: REPLAY_IMPACT_PROMPT_VERSION,
            model: app.runtimeEnv.OPENAI_HIGH_VALUE_MODEL,
            modelFamily: "gpt-5.6",
            promptDigest: REPLAY_IMPACT_PROMPT_DIGEST,
            schemaDigest: REPLAY_IMPACT_SCHEMA_DIGEST,
            sourceRevision: `builtin:replay-impact:v${REPLAY_IMPACT_PROMPT_VERSION}`,
          },
        );
        if (!run) throw app.httpErrors.notFound("Replay run not found");
        return reply.code(202).send({ llmRunId: run.id, status: run.status });
      } catch (error) {
        if (error instanceof Error && /completed replay|no deltas/.test(error.message)) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        throw error;
      }
    },
  );

  app.get(
    "/services/:identifier/replays/:replayRunId",
    {
      preHandler: app.requirePermission("replay:read"),
      schema: {
        tags: ["replays"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema.extend(replayRunPathParamsSchema.shape),
        response: { 200: replayRunDetailSchema },
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
      const detail = await getReplayRunDetail(
        app.database.db,
        context.organizationId,
        service.id,
        request.params.replayRunId,
      );
      if (!detail) throw app.httpErrors.notFound("Replay run not found");
      return {
        ...detail,
        run: serializeRun(detail.run),
        gateDecision: detail.gateDecision
          ? { ...detail.gateDecision, evaluatedAt: detail.gateDecision.evaluatedAt.toISOString() }
          : null,
      };
    },
  );

  app.post(
    "/services/:identifier/replays",
    {
      preHandler: app.requirePermission("replay:run", { recentAuth: true }),
      schema: {
        tags: ["replays"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        body: createReplayRunRequestSchema,
        response: { 201: createReplayRunResponseSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      if (!app.machineTokenPepper) {
        throw app.httpErrors.serviceUnavailable("Runner authentication is not configured");
      }
      const service = await getApiService(
        app.database.db,
        context.organizationId,
        request.params.identifier,
      );
      if (!service) throw app.httpErrors.notFound("Service not found");
      try {
        validateSigningKey(request.body.reportSigningPublicKey);
        const issued = await issueRunnerToken(app.machineTokenPepper);
        const expiresAt = new Date(Date.now() + 15 * 60_000);
        const nonce = randomBytes(32).toString("base64url");
        const nonceDigest = createHash("sha256").update(nonce).digest("hex");
        const run = await createReplayRun(
          app.database.db,
          context.organizationId,
          service.id,
          { userId: context.actor.actorId, requestId: request.id },
          request.body,
          { tokenPrefix: issued.tokenPrefix, tokenHash: issued.tokenHash, expiresAt, nonceDigest },
        );
        const corpus = await authorizeReplayCorpusRead(
          app.database.db,
          context.organizationId,
          run.replayCorpusId,
          { userId: context.actor.actorId, requestId: request.id },
        );
        if (!corpus || corpus.bucket !== app.objectStorage.bucket) {
          throw new Error("Replay corpus storage is unavailable");
        }
        const corpusUrlExpiresIn = 300;
        const corpusUrl = await app.objectStorage.signedReadUrl(
          context.organizationId,
          corpus.objectKey,
          corpusUrlExpiresIn,
        );
        const inputs = await getReplayRunInputs(app.database.db, context.organizationId, run.id);
        if (!inputs) throw new Error("Replay immutable inputs are unavailable");
        return reply.code(201).send({
          run: serializeRun(run),
          runnerCredential: {
            token: issued.token,
            nonce,
            expiresAt: expiresAt.toISOString(),
            corpusUrl,
            corpusUrlExpiresAt: new Date(Date.now() + corpusUrlExpiresIn * 1_000).toISOString(),
            nonceDigest,
            reportUploadPath: `/v1/runner/replays/${run.id}/report`,
            ...inputs,
          },
        });
      } catch (error) {
        if (error instanceof ReplayRunError && error.code === "not_found") {
          throw app.httpErrors.notFound(error.message);
        }
        if (error instanceof ReplayRunError && error.code === "conflict") {
          throw app.httpErrors.conflict(error.message);
        }
        if (error instanceof ReplayRunError || error instanceof TypeError) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        throw error;
      }
    },
  );

  app.post(
    "/runner/replays/:replayRunId/report",
    {
      preHandler: app.authenticateRunner("report:write"),
      bodyLimit: 17 * 1024 * 1024,
      schema: {
        tags: ["replays"],
        security: [{ bearerAuth: [] }],
        params: replayRunPathParamsSchema,
        body: uploadReplayReportRequestSchema,
        response: { 202: replayReportAcceptedSchema },
      },
    },
    async (request, reply) => {
      const credential = request.runnerCredential;
      if (!credential || credential.replayRunId !== request.params.replayRunId) {
        throw app.httpErrors.unauthorized("Runner credential is bound to a different run");
      }
      const actualNonceDigest = createHash("sha256").update(request.body.nonce).digest();
      const expectedNonceDigest = Buffer.from(credential.nonceDigest, "hex");
      if (
        actualNonceDigest.byteLength !== expectedNonceDigest.byteLength ||
        !timingSafeEqual(actualNonceDigest, expectedNonceDigest)
      ) {
        throw app.httpErrors.unauthorized("Runner nonce is invalid");
      }
      let reportBytes: Buffer;
      let signature: Buffer;
      try {
        reportBytes = Buffer.from(request.body.reportBase64, "base64");
        signature = Buffer.from(request.body.signatureBase64, "base64");
      } catch {
        throw app.httpErrors.badRequest("Report encoding is invalid");
      }
      if (reportBytes.byteLength === 0 || reportBytes.byteLength > 12 * 1024 * 1024) {
        throw app.httpErrors.badRequest("Replay report exceeds the accepted size");
      }
      const publicKey = createPublicKey({
        key: Buffer.from(credential.reportSigningPublicKey, "base64"),
        format: "der",
        type: "spki",
      });
      if (!verifySignature(null, reportBytes, publicKey, signature)) {
        throw app.httpErrors.unauthorized("Replay report signature is invalid");
      }
      let report: ReturnType<typeof replayReportSchema.parse>;
      try {
        report = replayReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
      } catch {
        throw app.httpErrors.unprocessableEntity("Replay report does not match the signed schema");
      }
      if (report.replay_run_id !== credential.replayRunId) {
        throw app.httpErrors.unprocessableEntity("Replay report is bound to a different run");
      }
      const uploaded = await app.objectStorage.put({
        organizationId: credential.organizationId,
        purpose: "replay-report",
        body: reportBytes,
        contentType: "application/json",
      });
      try {
        await app.objectStorage.verify(uploaded);
        const result = await persistReplayReport(
          app.database.db,
          credential,
          report,
          uploaded,
          request.id,
        );
        return reply.code(202).send({ ...result, status: "succeeded" });
      } catch (error) {
        await app.objectStorage
          .delete(credential.organizationId, uploaded.objectKey)
          .catch(() => undefined);
        if (error instanceof ReplayRunError && error.code === "conflict") {
          throw app.httpErrors.conflict(error.message);
        }
        if (error instanceof ReplayRunError) {
          throw app.httpErrors.unprocessableEntity(error.message);
        }
        throw error;
      }
    },
  );
};
