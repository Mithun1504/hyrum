import { describe, expect, it, vi } from "vitest";
import { authorizeReplayIntegrations, replayDetailsUrl } from "./replay";

const organizationId = "00000000-0000-4000-8000-000000000001";

describe("authorizeReplayIntegrations", () => {
  it("maps active tenant-owned destinations to internal ids", async () => {
    const tx = fakeTransaction([
      [{ id: "00000000-0000-4000-8000-000000000091" }],
      [{ id: "00000000-0000-4000-8000-000000000092" }],
    ]);

    await expect(
      authorizeReplayIntegrations(tx as never, organizationId, source(), forbidden),
    ).resolves.toEqual({
      githubId: "00000000-0000-4000-8000-000000000091",
      slackId: "00000000-0000-4000-8000-000000000092",
    });
    expect(tx.select).toHaveBeenCalledTimes(2);
  });

  it("rejects an unowned or inactive GitHub destination", async () => {
    const tx = fakeTransaction([[]]);

    await expect(
      authorizeReplayIntegrations(tx as never, organizationId, source(), forbidden),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.select).toHaveBeenCalledOnce();
  });

  it("rejects an unowned or inactive Slack destination", async () => {
    const tx = fakeTransaction([[]]);

    await expect(
      authorizeReplayIntegrations(
        tx as never,
        organizationId,
        { slack: { channel: "C123" } },
        forbidden,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

it("builds replay links from configured web URL, never request headers", () => {
  expect(replayDetailsUrl("https://app.hyrum.dev", organizationId)).toBe(
    `https://app.hyrum.dev/app/replay/${organizationId}`,
  );
});

function source() {
  return {
    github: {
      repository_owner: "hyrum",
      repository_name: "demo",
      head_sha: "f4e5d6c",
      pull_request: 42,
      installation_id: 91,
    },
    slack: { channel: "C123" },
  };
}

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function fakeTransaction(results: unknown[][]) {
  let index = 0;
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(results[index++] ?? []),
        }),
      }),
    })),
  };
}
