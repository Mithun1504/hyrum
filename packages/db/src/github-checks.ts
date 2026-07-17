import { and, eq } from "drizzle-orm";
import {
  apiServices,
  gateDecisions,
  githubCheckRuns,
  githubInstallations,
  githubRepositories,
  pullRequests,
  replayRuns,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";

function gateOutcome(value: string): "block" | "warn" | "note" | "pass" {
  if (value === "block" || value === "warn" || value === "note" || value === "pass") return value;
  throw new Error("Only a deterministic final gate outcome can be published");
}

export async function prepareGitHubCheckPublication(
  tx: DatabaseTransaction,
  organizationId: string,
  replayRunId: string,
  webUrl: string,
) {
  const [record] = await tx
    .select({
      repositoryId: githubRepositories.id,
      serviceSlug: apiServices.slug,
      owner: githubRepositories.ownerLogin,
      repository: githubRepositories.name,
      installationId: githubInstallations.githubInstallationId,
      pullRequestId: pullRequests.id,
      headSha: pullRequests.headSha,
      isFork: pullRequests.isFork,
      gateDecisionId: gateDecisions.id,
      outcome: gateDecisions.outcome,
      blockingImpactCount: gateDecisions.blockingImpactCount,
      warningImpactCount: gateDecisions.warningImpactCount,
      notedImpactCount: gateDecisions.notedImpactCount,
      existingCheckRunId: githubCheckRuns.githubCheckRunId,
    })
    .from(replayRuns)
    .innerJoin(
      apiServices,
      and(
        eq(apiServices.organizationId, replayRuns.organizationId),
        eq(apiServices.id, replayRuns.apiServiceId),
      ),
    )
    .innerJoin(
      gateDecisions,
      and(
        eq(gateDecisions.organizationId, replayRuns.organizationId),
        eq(gateDecisions.replayRunId, replayRuns.id),
      ),
    )
    .innerJoin(
      githubRepositories,
      and(
        eq(githubRepositories.organizationId, replayRuns.organizationId),
        eq(githubRepositories.id, replayRuns.githubRepositoryId),
      ),
    )
    .innerJoin(
      githubInstallations,
      and(
        eq(githubInstallations.organizationId, githubRepositories.organizationId),
        eq(githubInstallations.id, githubRepositories.githubInstallationId),
      ),
    )
    .innerJoin(
      pullRequests,
      and(
        eq(pullRequests.organizationId, replayRuns.organizationId),
        eq(pullRequests.id, replayRuns.pullRequestId),
      ),
    )
    .leftJoin(
      githubCheckRuns,
      and(
        eq(githubCheckRuns.organizationId, replayRuns.organizationId),
        eq(githubCheckRuns.replayRunId, replayRuns.id),
      ),
    )
    .where(and(eq(replayRuns.organizationId, organizationId), eq(replayRuns.id, replayRunId)))
    .limit(1);
  if (!record) return null;
  if (record.isFork) return { skipped: "fork" as const };
  const outcome = gateOutcome(record.outcome);
  const externalId = `hyrum:${replayRunId}`;
  await tx
    .insert(githubCheckRuns)
    .values({
      organizationId,
      githubRepositoryId: record.repositoryId,
      pullRequestId: record.pullRequestId,
      replayRunId,
      gateDecisionId: record.gateDecisionId,
      externalId,
      status: "queued",
      detailsUrl: `${webUrl.replace(/\/$/, "")}/app/${record.serviceSlug}/replays/${replayRunId}`,
    })
    .onConflictDoNothing({ target: githubCheckRuns.replayRunId });
  return {
    skipped: null,
    ...record,
    outcome,
    externalId,
    detailsUrl: `${webUrl.replace(/\/$/, "")}/app/${record.serviceSlug}/replays/${replayRunId}`,
  };
}

export async function markGitHubCheckPublished(
  tx: DatabaseTransaction,
  organizationId: string,
  replayRunId: string,
  input: { githubCheckRunId: bigint; conclusion: string; payloadDigest: string },
): Promise<void> {
  await tx
    .update(githubCheckRuns)
    .set({
      githubCheckRunId: input.githubCheckRunId,
      status: "completed",
      conclusion: input.conclusion,
      lastPayloadDigest: input.payloadDigest,
      publishedAt: new Date(),
      updatedAt: new Date(),
      failureCode: null,
    })
    .where(
      and(
        eq(githubCheckRuns.organizationId, organizationId),
        eq(githubCheckRuns.replayRunId, replayRunId),
      ),
    );
}
