import { createHmac, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildGitHubCheckPayload,
  createGitHubAppJwt,
  createGitHubInstallationToken,
  publishGitHubCheckRun,
  verifyGitHubWebhookSignature,
} from "./index";

describe("GitHub App integration", () => {
  it("verifies only an exact sha256 webhook signature", () => {
    const secret = "a-long-test-webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret)
      .update('{"action":"opened"}')
      .digest("hex")}`;
    expect(verifyGitHubWebhookSignature('{"action":"opened"}', signature, secret)).toBe(true);
    expect(verifyGitHubWebhookSignature('{"action":"closed"}', signature, secret)).toBe(false);
  });

  it("creates a short-lived RS256 app JWT and does not constrain token format", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = createGitHubAppJwt("123", pem, new Date("2026-07-16T00:00:00Z"));
    expect(jwt.split(".")).toHaveLength(3);
    const token = await createGitHubInstallationToken({
      appId: "123",
      privateKey: pem,
      installationId: 456n,
      fetch: async (_input, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        expect(authorization?.startsWith("Bearer ")).toBe(true);
        expect(authorization?.slice(7).split(".")).toHaveLength(3);
        return new Response(
          JSON.stringify({ token: "ghs_123_stateless-format", expires_at: "2026-07-16T01:00:00Z" }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
    });
    expect(token.token).toBe("ghs_123_stateless-format");
  });

  it("maps only a stored blocking outcome to a failing check", () => {
    expect(
      buildGitHubCheckPayload({
        externalId: "hyrum:run",
        headSha: "a".repeat(40),
        detailsUrl: "https://hyrum.test/replays/run",
        outcome: "block",
        blockingImpactCount: 1,
        warningImpactCount: 0,
        notedImpactCount: 0,
      }).conclusion,
    ).toBe("failure");
    expect(
      buildGitHubCheckPayload({
        externalId: "hyrum:run",
        headSha: "a".repeat(40),
        detailsUrl: "https://hyrum.test/replays/run",
        outcome: "warn",
        blockingImpactCount: 0,
        warningImpactCount: 1,
        notedImpactCount: 0,
      }).conclusion,
    ).toBe("neutral");
  });

  it("publishes a completed check from the deterministic payload", async () => {
    const payload = buildGitHubCheckPayload({
      externalId: "hyrum:run",
      headSha: "a".repeat(40),
      detailsUrl: "https://hyrum.test/replays/run",
      outcome: "pass",
      blockingImpactCount: 0,
      warningImpactCount: 0,
      notedImpactCount: 0,
    });
    const result = await publishGitHubCheckRun({
      owner: "hyrum",
      repository: "api",
      installationToken: "ghs_test",
      payload,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/hyrum/api/check-runs");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual(payload);
        return new Response(JSON.stringify({ id: 123 }), { status: 201 });
      },
    });
    expect(result.id).toBe(123n);
  });
});
