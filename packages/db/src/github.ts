import { and, eq, isNull } from "drizzle-orm";
import type { Database, DatabaseClient } from "./index";
import { auditEvents, githubInstallations, githubRepositories, pullRequests } from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface GitHubInstallationRoute {
  organizationId: string;
  installationId: string;
}

export async function resolveGitHubInstallation(
  client: DatabaseClient,
  githubInstallationId: bigint,
): Promise<GitHubInstallationRoute | null> {
  const rows = await client.sql<
    Array<{ organization_id: string; installation_id: string }>
  >`select * from hyrum_resolve_github_installation(${githubInstallationId.toString()}::bigint)`;
  const row = rows[0];
  return row ? { organizationId: row.organization_id, installationId: row.installation_id } : null;
}

export async function finishProviderWebhook(
  client: DatabaseClient,
  input: {
    provider: string;
    deliveryId: string;
    organizationId: string | null;
    status: "processed" | "ignored" | "failed";
    errorCode: string | null;
  },
): Promise<void> {
  await client.sql`
    select hyrum_finish_provider_webhook(
      ${input.provider}, ${input.deliveryId}, ${input.organizationId},
      ${input.status}, ${input.errorCode}
    )
  `;
}

export async function registerGitHubInstallation(
  db: Database,
  organizationId: string,
  actor: { membershipId: string; userId: string; requestId: string },
  input: {
    githubInstallationId: bigint;
    accountLogin: string;
    accountType: string;
    permissions: Record<string, unknown>;
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const [installation] = await tx
      .insert(githubInstallations)
      .values({
        organizationId,
        githubInstallationId: input.githubInstallationId,
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        status: "active",
        permissions: input.permissions,
        installedByMembershipId: actor.membershipId,
        installedAt: now,
      })
      .onConflictDoUpdate({
        target: githubInstallations.githubInstallationId,
        set: {
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          status: "active",
          permissions: input.permissions,
          suspendedAt: null,
          deletedAt: null,
          updatedAt: now,
        },
      })
      .returning();
    if (!installation) throw new Error("GitHub installation registration returned no record");
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: now,
      actorType: "user",
      actorId: actor.userId,
      action: "github_installation.registered",
      resourceType: "github_installation",
      resourceId: installation.id,
      requestId: actor.requestId,
      changes: { githubInstallationId: input.githubInstallationId.toString() },
      outcome: "succeeded",
    });
    return installation;
  });
}

export async function syncGitHubRepository(
  db: Database,
  organizationId: string,
  installationId: string,
  input: {
    githubRepositoryId: bigint;
    ownerLogin: string;
    name: string;
    defaultBranch: string;
    active: boolean;
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [repository] = await tx
      .insert(githubRepositories)
      .values({ organizationId, githubInstallationId: installationId, ...input })
      .onConflictDoUpdate({
        target: [githubRepositories.githubInstallationId, githubRepositories.githubRepositoryId],
        set: {
          ownerLogin: input.ownerLogin,
          name: input.name,
          defaultBranch: input.defaultBranch,
          active: input.active,
          deletedAt: input.active ? null : new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!repository) throw new Error("GitHub repository synchronization returned no record");
    return repository;
  });
}

export async function syncGitHubPullRequest(
  db: Database,
  organizationId: string,
  githubRepositoryId: bigint,
  input: {
    githubPullRequestId: bigint;
    number: number;
    headSha: string;
    baseSha: string;
    state: string;
    isFork: boolean;
    authorLogin: string;
    openedAt: Date;
    updatedFromGithubAt: Date;
    closedAt: Date | null;
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [repository] = await tx
      .select({ id: githubRepositories.id })
      .from(githubRepositories)
      .where(
        and(
          eq(githubRepositories.organizationId, organizationId),
          eq(githubRepositories.githubRepositoryId, githubRepositoryId),
          isNull(githubRepositories.deletedAt),
        ),
      )
      .limit(1);
    if (!repository) return null;
    const [pullRequest] = await tx
      .insert(pullRequests)
      .values({ organizationId, githubRepositoryId: repository.id, ...input })
      .onConflictDoUpdate({
        target: [pullRequests.githubRepositoryId, pullRequests.number],
        set: {
          githubPullRequestId: input.githubPullRequestId,
          headSha: input.headSha,
          baseSha: input.baseSha,
          state: input.state,
          isFork: input.isFork,
          authorLogin: input.authorLogin,
          updatedFromGithubAt: input.updatedFromGithubAt,
          closedAt: input.closedAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return pullRequest ?? null;
  });
}
