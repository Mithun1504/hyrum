import { z } from "zod";

export const registerGitHubInstallationSchema = z.strictObject({
  installationId: z.string().regex(/^\d+$/),
  accountLogin: z.string().trim().min(1).max(200),
  accountType: z.enum(["Organization", "User"]),
  permissions: z.record(z.string(), z.string()).default({}),
});

export const githubInstallationSchema = z.object({
  id: z.uuid(),
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.string(),
  status: z.enum(["pending", "active", "degraded", "revoked"]),
  installedAt: z.iso.datetime(),
});

export const webhookAcceptedSchema = z.object({
  received: z.literal(true),
  duplicate: z.boolean(),
});

export const configureSlackInstallationSchema = z.strictObject({
  teamId: z.string().trim().min(1).max(100),
  teamName: z.string().trim().min(1).max(200),
  channelId: z.string().trim().min(1).max(100),
});

export const slackInstallationSchema = z.object({
  id: z.uuid(),
  teamId: z.string(),
  teamName: z.string(),
  channelId: z.string().nullable(),
  status: z.enum(["pending", "active", "degraded", "revoked"]),
  installedAt: z.iso.datetime(),
});
export const slackInstallationResponseSchema = z.object({
  data: slackInstallationSchema.nullable(),
});

export const githubRepositorySchema = z.object({
  id: z.uuid(),
  ownerLogin: z.string(),
  name: z.string(),
  defaultBranch: z.string(),
  active: z.boolean(),
});
export const githubRepositoryListSchema = z.object({ data: z.array(githubRepositorySchema) });

const repositoryPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((segment) => segment === ".." || segment === "." || segment === ""),
    "Must be a normalized repository-relative path",
  );

export const createRepositoryConnectionSchema = z.strictObject({
  githubRepositoryId: z.uuid(),
  specPath: repositoryPathSchema,
  workflowPath: repositoryPathSchema,
  baseImageBuildRef: z.string().trim().min(1).max(500),
  candidateImageBuildRef: z.string().trim().min(1).max(500),
});
export type CreateRepositoryConnection = z.infer<typeof createRepositoryConnectionSchema>;

export const repositoryConnectionSchema = z.object({
  id: z.uuid(),
  githubRepositoryId: z.uuid(),
  ownerLogin: z.string(),
  repositoryName: z.string(),
  specPath: z.string(),
  workflowPath: z.string(),
  baseImageBuildRef: z.string(),
  candidateImageBuildRef: z.string(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type RepositoryConnection = z.infer<typeof repositoryConnectionSchema>;
export const repositoryConnectionListSchema = z.object({
  repositories: z.array(githubRepositorySchema),
  connections: z.array(repositoryConnectionSchema),
});

export const slackOAuthUrlRequestSchema = z.strictObject({
  channelId: z.string().trim().min(1).max(100),
});
export const slackOAuthUrlSchema = z.object({ url: z.url() });
export const slackOAuthCallbackSchema = z.strictObject({
  code: z.string().min(1).max(500),
  state: z.string().min(1).max(2_000),
});
