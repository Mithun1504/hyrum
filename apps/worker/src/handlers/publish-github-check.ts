import { createHash } from "node:crypto";
import {
  type ClaimedJob,
  type DatabaseTransaction,
  markGitHubCheckPublished,
  prepareGitHubCheckPublication,
} from "@hyrum/db";
import {
  buildGitHubCheckPayload,
  createGitHubInstallationToken,
  publishGitHubCheckRun,
} from "@hyrum/integrations";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ replayRunId: z.uuid() });

export function createPublishGitHubCheckHandler(config: {
  appId: string | undefined;
  privateKey: string | undefined;
  webUrl: string;
}): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("GitHub Check jobs must be tenant scoped");
    if (!config.appId || !config.privateKey) throw new Error("GitHub App is not configured");
    const { replayRunId } = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const publication = await prepareGitHubCheckPublication(
      tx,
      context.organizationId,
      replayRunId,
      config.webUrl,
    );
    if (!publication || publication.skipped === "fork") return;
    const token = await createGitHubInstallationToken({
      appId: config.appId,
      privateKey: config.privateKey.replaceAll("\\n", "\n"),
      installationId: publication.installationId,
    });
    const payload = buildGitHubCheckPayload({
      externalId: publication.externalId,
      headSha: publication.headSha,
      detailsUrl: publication.detailsUrl,
      outcome: publication.outcome,
      blockingImpactCount: publication.blockingImpactCount,
      warningImpactCount: publication.warningImpactCount,
      notedImpactCount: publication.notedImpactCount,
    });
    const result = await publishGitHubCheckRun({
      owner: publication.owner,
      repository: publication.repository,
      installationToken: token.token,
      payload,
      existingCheckRunId: publication.existingCheckRunId,
    });
    await markGitHubCheckPublished(tx, context.organizationId, replayRunId, {
      githubCheckRunId: result.id,
      conclusion: payload.conclusion,
      payloadDigest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    });
  };
}
