import { createHash } from "node:crypto";
import {
  configureSlackInstallationSchema,
  createRepositoryConnectionSchema,
  githubInstallationSchema,
  registerGitHubInstallationSchema,
  repositoryConnectionListSchema,
  repositoryConnectionSchema,
  servicePathParamsSchema,
  slackInstallationResponseSchema,
  slackInstallationSchema,
  slackOAuthCallbackSchema,
  slackOAuthUrlRequestSchema,
  slackOAuthUrlSchema,
} from "@hyrum/contracts";
import {
  createServiceRepositoryConnection,
  getApiService,
  getSlackInstallation,
  listServiceRepositoryConnections,
  registerGitHubInstallation,
  registerSlackInstallation,
} from "@hyrum/db";
import {
  createSlackOAuthState,
  encryptIntegrationToken,
  exchangeSlackOAuthCode,
  verifySlackOAuthState,
} from "@hyrum/integrations";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const integrationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/services/:identifier/repository-connections",
    {
      preHandler: app.requirePermission("integration:read"),
      schema: {
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        response: { 200: repositoryConnectionListSchema },
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
      const result = await listServiceRepositoryConnections(
        app.database.db,
        context.organizationId,
        service.id,
      );
      return {
        repositories: result.repositories,
        connections: result.connections.map((connection) => ({
          ...connection,
          createdAt: connection.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post(
    "/services/:identifier/repository-connections",
    {
      preHandler: app.requirePermission("integration:manage", { recentAuth: true }),
      schema: {
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
        params: servicePathParamsSchema,
        body: createRepositoryConnectionSchema,
        response: { 201: repositoryConnectionSchema },
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
      try {
        const created = await createServiceRepositoryConnection(
          app.database.db,
          context.organizationId,
          service.id,
          {
            membershipId: context.actor.membershipId,
            userId: context.actor.actorId,
            requestId: request.id,
          },
          request.body,
        );
        const result = await listServiceRepositoryConnections(
          app.database.db,
          context.organizationId,
          service.id,
        );
        const connection = result.connections.find(({ id }) => id === created.id);
        if (!connection) throw new Error("Created repository connection is unavailable");
        return reply.code(201).send({
          ...connection,
          createdAt: connection.createdAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof TypeError) throw app.httpErrors.unprocessableEntity(error.message);
        if (error instanceof Error && error.message.includes("unavailable")) {
          throw app.httpErrors.conflict(error.message);
        }
        throw error;
      }
    },
  );
  app.post(
    "/integrations/slack/oauth-url",
    {
      preHandler: app.requirePermission("integration:manage", { recentAuth: true }),
      schema: {
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
        body: slackOAuthUrlRequestSchema,
        response: { 200: slackOAuthUrlSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const clientId = app.runtimeEnv.SLACK_CLIENT_ID;
      const redirectUri = app.runtimeEnv.SLACK_OAUTH_REDIRECT_URI;
      const stateSecret = app.runtimeEnv.INTEGRATION_TOKEN_ENCRYPTION_KEY;
      if (!clientId || !redirectUri || !stateSecret) {
        throw app.httpErrors.serviceUnavailable("Slack OAuth is not configured");
      }
      const state = createSlackOAuthState(
        {
          organizationId: context.organizationId,
          membershipId: context.actor.membershipId,
          channelId: request.body.channelId,
        },
        stateSecret,
      );
      const url = new URL("https://slack.com/oauth/v2/authorize");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("scope", "chat:write");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return { url: url.toString() };
    },
  );

  app.post(
    "/integrations/slack/oauth-callback",
    {
      preHandler: app.requirePermission("integration:manage", { recentAuth: true }),
      schema: {
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
        body: slackOAuthCallbackSchema,
        response: { 201: slackInstallationSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const clientId = app.runtimeEnv.SLACK_CLIENT_ID;
      const clientSecret = app.runtimeEnv.SLACK_CLIENT_SECRET;
      const redirectUri = app.runtimeEnv.SLACK_OAUTH_REDIRECT_URI;
      const encryptionKey = app.runtimeEnv.INTEGRATION_TOKEN_ENCRYPTION_KEY;
      if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
        throw app.httpErrors.serviceUnavailable("Slack OAuth is not configured");
      }
      const state = verifySlackOAuthState(request.body.state, encryptionKey, {
        organizationId: context.organizationId,
        membershipId: context.actor.membershipId,
      });
      if (!state) throw app.httpErrors.unauthorized("Invalid or expired Slack OAuth state");
      const exchanged = await exchangeSlackOAuthCode({
        code: request.body.code,
        clientId,
        clientSecret,
        redirectUri,
      });
      const installation = await registerSlackInstallation(
        app.database.db,
        context.organizationId,
        {
          membershipId: context.actor.membershipId,
          userId: context.actor.actorId,
          requestId: request.id,
        },
        {
          slackTeamId: exchanged.teamId,
          teamName: exchanged.teamName,
          channelId: state.channelId,
          encryptedBotToken: encryptIntegrationToken(
            exchanged.botToken,
            context.organizationId,
            encryptionKey,
          ),
          keyReference: `env:v1:${createHash("sha256").update(encryptionKey).digest("hex").slice(0, 16)}`,
          scopes: exchanged.scopes,
        },
      );
      return reply.code(201).send({
        ...installation,
        channelId: state.channelId,
        installedAt: installation.installedAt.toISOString(),
      });
    },
  );

  app.get(
    "/integrations/slack",
    {
      preHandler: app.requirePermission("integration:read"),
      schema: {
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
        response: { 200: slackInstallationResponseSchema },
      },
    },
    async (request) => {
      const context = request.authContext;
      if (!context) throw app.httpErrors.unauthorized();
      const installation = await getSlackInstallation(app.database.db, context.organizationId);
      return {
        data: installation
          ? { ...installation, installedAt: installation.installedAt.toISOString() }
          : null,
      };
    },
  );

  app.post(
    "/integrations/slack/configure",
    {
      preHandler: app.requirePermission("integration:manage", { recentAuth: true }),
      schema: {
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
        body: configureSlackInstallationSchema,
        response: { 201: slackInstallationSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const botToken = app.runtimeEnv.SLACK_BOT_TOKEN;
      const encryptionKey = app.runtimeEnv.INTEGRATION_TOKEN_ENCRYPTION_KEY;
      if (!botToken || !encryptionKey) {
        throw app.httpErrors.serviceUnavailable("Slack token encryption is not configured");
      }
      const installation = await registerSlackInstallation(
        app.database.db,
        context.organizationId,
        {
          membershipId: context.actor.membershipId,
          userId: context.actor.actorId,
          requestId: request.id,
        },
        {
          slackTeamId: request.body.teamId,
          teamName: request.body.teamName,
          channelId: request.body.channelId,
          encryptedBotToken: encryptIntegrationToken(
            botToken,
            context.organizationId,
            encryptionKey,
          ),
          keyReference: `env:v1:${createHash("sha256").update(encryptionKey).digest("hex").slice(0, 16)}`,
          scopes: ["chat:write"],
        },
      );
      return reply.code(201).send({
        ...installation,
        channelId: request.body.channelId,
        installedAt: installation.installedAt.toISOString(),
      });
    },
  );
  app.post(
    "/integrations/github/installations",
    {
      preHandler: app.requirePermission("integration:manage", { recentAuth: true }),
      schema: {
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
        body: registerGitHubInstallationSchema,
        response: { 201: githubInstallationSchema },
      },
    },
    async (request, reply) => {
      const context = request.authContext;
      if (!context?.actor.membershipId) throw app.httpErrors.unauthorized();
      const installation = await registerGitHubInstallation(
        app.database.db,
        context.organizationId,
        {
          membershipId: context.actor.membershipId,
          userId: context.actor.actorId,
          requestId: request.id,
        },
        {
          githubInstallationId: BigInt(request.body.installationId),
          accountLogin: request.body.accountLogin,
          accountType: request.body.accountType,
          permissions: request.body.permissions,
        },
      );
      return reply.code(201).send({
        id: installation.id,
        installationId: installation.githubInstallationId.toString(),
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        status: installation.status,
        installedAt: installation.installedAt.toISOString(),
      });
    },
  );
};
