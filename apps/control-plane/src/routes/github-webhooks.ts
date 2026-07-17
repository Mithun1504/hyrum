import { createHash } from "node:crypto";
import { webhookAcceptedSchema } from "@hyrum/contracts";
import {
  claimWebhookDelivery,
  finishProviderWebhook,
  resolveGitHubInstallation,
  syncGitHubPullRequest,
  syncGitHubRepository,
} from "@hyrum/db";
import { verifyGitHubWebhookSignature } from "@hyrum/integrations";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const repositorySchema = z.object({
  id: z.number().int().safe().positive(),
  name: z.string().min(1),
  full_name: z.string().min(3),
  default_branch: z.string().min(1).default("main"),
});
const pullRequestSchema = z.object({
  id: z.number().int().safe().positive(),
  number: z.number().int().positive(),
  state: z.string().min(1),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  closed_at: z.iso.datetime().nullable(),
  user: z.object({ login: z.string().min(1) }),
  head: z.object({
    sha: z.string().regex(/^[0-9a-f]{40}$/),
    repo: z.object({ id: z.number().int().safe().positive() }).nullable(),
  }),
  base: z.object({
    sha: z.string().regex(/^[0-9a-f]{40}$/),
    repo: z.object({ id: z.number().int().safe().positive() }),
  }),
});
const githubWebhookSchema = z
  .object({
    action: z.string().optional(),
    installation: z.object({ id: z.number().int().safe().positive() }).optional(),
    repository: repositorySchema.optional(),
    repositories: z.array(repositorySchema).optional(),
    repositories_added: z.array(repositorySchema).optional(),
    repositories_removed: z.array(repositorySchema).optional(),
    pull_request: pullRequestSchema.optional(),
  })
  .loose();

export const githubWebhookRoutes: FastifyPluginAsyncZod<{
  webhookSecret: string | undefined;
}> = async (app, options) => {
  app.post(
    "/webhooks/github",
    {
      config: { rawBody: true },
      schema: {
        tags: ["webhooks"],
        headers: z
          .object({
            "x-github-delivery": z.string().uuid(),
            "x-github-event": z.string().min(1).max(100),
            "x-hub-signature-256": z.string().startsWith("sha256="),
          })
          .loose(),
        body: z.unknown(),
        response: { 202: webhookAcceptedSchema },
      },
    },
    async (request, reply) => {
      if (!options.webhookSecret) {
        throw app.httpErrors.serviceUnavailable("GitHub webhooks are not configured");
      }
      if (typeof request.rawBody !== "string") {
        throw app.httpErrors.badRequest("Raw webhook body is unavailable");
      }
      if (
        !verifyGitHubWebhookSignature(
          request.rawBody,
          request.headers["x-hub-signature-256"],
          options.webhookSecret,
        )
      ) {
        throw app.httpErrors.unauthorized("Invalid GitHub webhook signature");
      }
      const deliveryId = request.headers["x-github-delivery"];
      const eventType = request.headers["x-github-event"];
      const payloadDigest = createHash("sha256").update(request.rawBody).digest("hex");
      const claimed = await claimWebhookDelivery(app.database.sql, {
        provider: "github",
        deliveryId,
        eventType,
        payloadDigest,
      });
      if (!claimed) return reply.code(202).send({ received: true, duplicate: true });

      let organizationId: string | null = null;
      try {
        const payload = githubWebhookSchema.parse(JSON.parse(request.rawBody));
        if (!payload.installation) {
          await finishProviderWebhook(app.database, {
            provider: "github",
            deliveryId,
            organizationId: null,
            status: "ignored",
            errorCode: null,
          });
          return reply.code(202).send({ received: true, duplicate: false });
        }
        const route = await resolveGitHubInstallation(
          app.database,
          BigInt(payload.installation.id),
        );
        if (!route) {
          await finishProviderWebhook(app.database, {
            provider: "github",
            deliveryId,
            organizationId: null,
            status: "ignored",
            errorCode: "INSTALLATION_NOT_REGISTERED",
          });
          return reply.code(202).send({ received: true, duplicate: false });
        }
        organizationId = route.organizationId;
        let handled = false;
        const activeRepositories = [
          ...(payload.repositories ?? []),
          ...(payload.repositories_added ?? []),
          ...(payload.repository ? [payload.repository] : []),
        ];
        for (const repository of activeRepositories) {
          const [ownerLogin] = repository.full_name.split("/");
          if (!ownerLogin) throw new Error("GitHub repository owner is unavailable");
          await syncGitHubRepository(app.database.db, organizationId, route.installationId, {
            githubRepositoryId: BigInt(repository.id),
            ownerLogin,
            name: repository.name,
            defaultBranch: repository.default_branch,
            active: true,
          });
          handled = true;
        }
        for (const repository of payload.repositories_removed ?? []) {
          const [ownerLogin] = repository.full_name.split("/");
          if (!ownerLogin) throw new Error("GitHub repository owner is unavailable");
          await syncGitHubRepository(app.database.db, organizationId, route.installationId, {
            githubRepositoryId: BigInt(repository.id),
            ownerLogin,
            name: repository.name,
            defaultBranch: repository.default_branch,
            active: false,
          });
          handled = true;
        }
        if (payload.repository && payload.pull_request) {
          const pullRequest = payload.pull_request;
          await syncGitHubPullRequest(
            app.database.db,
            organizationId,
            BigInt(payload.repository.id),
            {
              githubPullRequestId: BigInt(pullRequest.id),
              number: pullRequest.number,
              headSha: pullRequest.head.sha,
              baseSha: pullRequest.base.sha,
              state: pullRequest.state,
              isFork:
                pullRequest.head.repo === null ||
                pullRequest.head.repo.id !== pullRequest.base.repo.id,
              authorLogin: pullRequest.user.login,
              openedAt: new Date(pullRequest.created_at),
              updatedFromGithubAt: new Date(pullRequest.updated_at),
              closedAt: pullRequest.closed_at ? new Date(pullRequest.closed_at) : null,
            },
          );
          handled = true;
        }
        await finishProviderWebhook(app.database, {
          provider: "github",
          deliveryId,
          organizationId,
          status: handled ? "processed" : "ignored",
          errorCode: null,
        });
        return reply.code(202).send({ received: true, duplicate: false });
      } catch (error) {
        await finishProviderWebhook(app.database, {
          provider: "github",
          deliveryId,
          organizationId,
          status: "failed",
          errorCode: "GITHUB_RECONCILIATION_FAILED",
        });
        throw error;
      }
    },
  );
};
