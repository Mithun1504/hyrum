import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createSlackOAuthState,
  decryptIntegrationToken,
  encryptIntegrationToken,
  exchangeSlackOAuthCode,
  publishSlackNotification,
  verifySlackOAuthState,
  verifySlackWebhookSignature,
} from "./index";

const organizationId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const secret = "s".repeat(32);
const encryptionKey = "a".repeat(64);

describe("Slack integration", () => {
  it("verifies raw-body signatures and rejects stale requests", () => {
    const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
    const timestamp = "1700000000";
    const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
    expect(
      verifySlackWebhookSignature({
        rawBody: body,
        timestamp,
        signature,
        signingSecret: secret,
        now: new Date(1_700_000_100_000),
      }),
    ).toBe(true);
    expect(
      verifySlackWebhookSignature({
        rawBody: body,
        timestamp,
        signature,
        signingSecret: secret,
        now: new Date(1_700_001_000_000),
      }),
    ).toBe(false);
  });

  it("binds OAuth state to the tenant and membership", () => {
    const now = new Date(1_700_000_000_000);
    const state = createSlackOAuthState(
      { organizationId, membershipId, channelId: "C123" },
      secret,
      now,
    );
    expect(
      verifySlackOAuthState(state, secret, { organizationId, membershipId }, now),
    ).not.toBeNull();
    expect(
      verifySlackOAuthState(state, secret, { organizationId, membershipId: organizationId }, now),
    ).toBeNull();
  });

  it("encrypts tokens with tenant-bound authenticated encryption", () => {
    const encrypted = encryptIntegrationToken("xoxb-secret", organizationId, encryptionKey);
    expect(encrypted).not.toContain("xoxb-secret");
    expect(decryptIntegrationToken(encrypted, organizationId, encryptionKey)).toBe("xoxb-secret");
    expect(() => decryptIntegrationToken(encrypted, membershipId, encryptionKey)).toThrow();
  });

  it("exchanges OAuth codes and publishes bounded messages", async () => {
    const oauthFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: "xoxb-token",
          scope: "chat:write,channels:read",
          team: { id: "T1", name: "Test" },
        }),
      ),
    );
    await expect(
      exchangeSlackOAuthCode({
        code: "code",
        clientId: "client",
        clientSecret: "secret",
        redirectUri: "https://example.test/callback",
        fetch: oauthFetch,
      }),
    ).resolves.toMatchObject({ teamId: "T1", botToken: "xoxb-token" });

    const postFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, channel: "C1", ts: "1.2" })));
    await expect(
      publishSlackNotification({
        botToken: "xoxb-token",
        channelId: "C1",
        title: "Gate blocked",
        bodyText: "One deterministic impact.",
        clientMessageId: "11111111-1111-4111-8111-111111111111",
        fetch: postFetch,
      }),
    ).resolves.toEqual({ messageId: "1.2" });
  });
});
