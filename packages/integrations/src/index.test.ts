import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createGitHubCheckRunFixture,
  createSlackGateNotification,
  gateIntegrationOutboxEventSchema,
  publishGitHubCheckRun,
  publishSlackGateNotification,
  verifyGitHubWebhook,
  verifySlackRequest,
} from "./index";

const secret = "a-long-enough-demo-secret";

describe("integration boundaries", () => {
  it("verifies GitHub against the exact raw body", () => {
    const raw = Buffer.from('{"action":"opened"}');
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyGitHubWebhook(raw, signature, secret)).toBe(true);
    expect(verifyGitHubWebhook(Buffer.from("{}"), signature, secret)).toBe(false);
  });

  it("rejects stale Slack requests", () => {
    const raw = Buffer.from("payload=test");
    const timestamp = "1000";
    const signature = `v0=${createHmac("sha256", secret)
      .update(`v0:${timestamp}:${raw.toString("utf8")}`)
      .digest("hex")}`;
    expect(verifySlackRequest(raw, timestamp, signature, secret, 1001)).toBe(true);
    expect(verifySlackRequest(raw, timestamp, signature, secret, 2000)).toBe(false);
  });

  it("maps deterministic tiers to a faithful Check Run fixture", () => {
    const fixture = createGitHubCheckRunFixture({
      reportId: "report-1",
      headSha: "f4e5d6c",
      decision: {
        outcome: "block",
        blockCount: 1,
        warnCount: 1,
        noteCount: 0,
        reasons: ["T1 claim claim-a matched response.next_cursor"],
      },
    });
    expect(fixture.conclusion).toBe("failure");
    expect(fixture.output.title).toContain("proven echo");
  });

  it("keeps receipt bodies out of Slack", () => {
    const message = createSlackGateNotification({
      repository: "hyrum/demo",
      pullRequest: 42,
      detailsUrl: "https://app.example.test/replays/report-1",
      decision: { outcome: "warn", blockCount: 0, warnCount: 1, noteCount: 0, reasons: [] },
    });
    expect(JSON.stringify(message)).not.toContain("receipt");
  });

  it("accepts only tenant-owned integration ids in queued delivery payloads", () => {
    const queued = gateIntegrationOutboxEventSchema.parse({
      ...gateEvent({}),
      github: {
        integrationId: "00000000-0000-4000-8000-000000000091",
        headSha: "f4e5d6c",
        pullRequest: 42,
      },
    });

    expect(queued.github?.integrationId).toBe("00000000-0000-4000-8000-000000000091");
    expect(() =>
      gateIntegrationOutboxEventSchema.parse({
        ...gateEvent({}),
        github: {
          installationId: 91,
          headSha: "f4e5d6c",
          repository: { owner: "other-tenant", name: "private" },
          pullRequest: 42,
        },
      }),
    ).toThrow();
  });

  it("upserts an existing GitHub Check Run by the outbox external id", async () => {
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue({});
    const octokit = {
      rest: {
        checks: {
          listForRef: vi.fn().mockResolvedValue({
            data: { check_runs: [{ id: 71, external_id: "00000000-0000-4000-8000-000000000071" }] },
          }),
          create,
          update,
        },
      },
    };

    await publishGitHubCheckRun(
      {
        ...gateEvent({}),
        github: {
          installationId: 91,
          headSha: "f4e5d6c",
          repository: { owner: "hyrum", name: "demo" },
          pullRequest: 42,
        },
      },
      {
        appId: "1",
        privateKey: "private-key",
      },
      octokit as never,
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ check_run_id: 71, conclusion: "failure" }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("uses the outbox id as Slack's retry idempotency key", async () => {
    const apiCall = vi.fn().mockResolvedValue({ ok: true });

    await publishSlackGateNotification(
      { ...gateEvent({}), slack: { channel: "C123" } },
      "xoxb-test",
      { apiCall } as never,
    );

    expect(apiCall).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({
        channel: "C123",
        client_msg_id: "00000000-0000-4000-8000-000000000071",
      }),
    );
  });
});

function gateEvent(destinations: {
  github?: {
    installationId: number;
    headSha: string;
    repository: { owner: string; name: string };
    pullRequest: number;
  };
  slack?: { channel: string };
}) {
  return {
    reportId: "00000000-0000-4000-8000-000000000071",
    detailsUrl: "https://app.example.test/replays/report-1",
    decision: {
      outcome: "block" as const,
      blockCount: 1,
      warnCount: 0,
      noteCount: 0,
      reasons: ["T1 echo changed"],
    },
    ...destinations,
  };
}
