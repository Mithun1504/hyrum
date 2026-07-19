import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publishGitHubCheckRun, publishSlackGateNotification } from "./index";

const enabled = process.env.HYRUM_RUN_LIVE_INTEGRATIONS === "1";
const decision = {
  outcome: "pass" as const,
  blockCount: 0,
  warnCount: 0,
  noteCount: 0,
  reasons: ["Live delivery verification"],
};

describe.skipIf(!enabled)("live delivery providers", () => {
  it("creates or updates a GitHub check in the configured sandbox repository", async () => {
    const [owner, name] = required("HYRUM_LIVE_GITHUB_REPOSITORY").split("/");
    expect(owner && name).toBeTruthy();
    await publishGitHubCheckRun(
      {
        reportId: randomUUID(),
        detailsUrl: required("HYRUM_LIVE_DETAILS_URL"),
        decision,
        github: {
          installationId: Number(required("HYRUM_LIVE_GITHUB_INSTALLATION_ID")),
          headSha: required("HYRUM_LIVE_GITHUB_HEAD_SHA"),
          repository: { owner: owner ?? "", name: name ?? "" },
          pullRequest: Number(required("HYRUM_LIVE_GITHUB_PULL_REQUEST")),
        },
      },
      { appId: required("GITHUB_APP_ID"), privateKey: required("GITHUB_APP_PRIVATE_KEY") },
    );
  });

  it("posts an idempotent Slack notification to the configured sandbox channel", async () => {
    await publishSlackGateNotification(
      {
        reportId: randomUUID(),
        detailsUrl: required("HYRUM_LIVE_DETAILS_URL"),
        decision,
        slack: { channel: required("HYRUM_LIVE_SLACK_CHANNEL") },
      },
      required("SLACK_BOT_TOKEN"),
    );
  });
});

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live integration tests`);
  return value;
}
