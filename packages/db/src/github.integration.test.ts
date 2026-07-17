import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registerGitHubInstallation,
  resolveGitHubInstallation,
  syncGitHubPullRequest,
  syncGitHubRepository,
} from "./github";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { githubRepositories, pullRequests } from "./schema";
import { withOrganizationContext } from "./tenancy";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("GitHub integration repository", () => {
  let client: DatabaseClient;
  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 1);
  });
  afterAll(async () => client.close());

  it("routes an installation and idempotently synchronizes repositories and pull requests", async () => {
    const suffix = crypto.randomUUID();
    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `github-org-${suffix}`,
      organizationName: "GitHub workspace",
      organizationSlug: `github-${suffix}`,
      workosUserId: `github-user-${suffix}`,
      userEmail: `github-${suffix}@example.test`,
      userDisplayName: "GitHub Owner",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `github-membership-${suffix}`,
      role: "owner",
      status: "active",
    });
    const externalInstallationId = BigInt(Date.now());
    const installation = await registerGitHubInstallation(
      client.db,
      identity.organizationId,
      {
        membershipId: identity.membershipId,
        userId: identity.userId,
        requestId: `github-register-${suffix}`,
      },
      {
        githubInstallationId: externalInstallationId,
        accountLogin: "example",
        accountType: "Organization",
        permissions: { checks: "write", contents: "read", pull_requests: "read" },
      },
    );
    await expect(resolveGitHubInstallation(client, externalInstallationId)).resolves.toEqual({
      organizationId: identity.organizationId,
      installationId: installation.id,
    });
    const repository = await syncGitHubRepository(
      client.db,
      identity.organizationId,
      installation.id,
      {
        githubRepositoryId: externalInstallationId + 1n,
        ownerLogin: "example",
        name: "api",
        defaultBranch: "main",
        active: true,
      },
    );
    await syncGitHubPullRequest(client.db, identity.organizationId, externalInstallationId + 1n, {
      githubPullRequestId: externalInstallationId + 2n,
      number: 7,
      headSha: "a".repeat(40),
      baseSha: "b".repeat(40),
      state: "open",
      isFork: false,
      authorLogin: "engineer",
      openedAt: new Date("2026-07-16T00:00:00Z"),
      updatedFromGithubAt: new Date("2026-07-16T00:01:00Z"),
      closedAt: null,
    });
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      await expect(
        tx.select().from(githubRepositories).where(eq(githubRepositories.id, repository.id)),
      ).resolves.toHaveLength(1);
      await expect(
        tx
          .select()
          .from(pullRequests)
          .where(eq(pullRequests.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([{ githubRepositoryId: repository.id, number: 7, isFork: false }]);
    });
  });
});
