import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createSign,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

export const githubAppConfigSchema = z.object({
  appId: z.string().min(1),
  privateKey: z.string().min(1),
  webhookSecret: z.string().min(16),
});

export const slackAppConfigSchema = z.object({
  signingSecret: z.string().min(1),
  botToken: z.string().startsWith("xoxb-").optional(),
});

export interface SlackOAuthState {
  organizationId: string;
  membershipId: string;
  channelId: string;
  expiresAt: number;
  nonce: string;
}

function hmacDigest(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function createSlackOAuthState(
  input: Omit<SlackOAuthState, "expiresAt" | "nonce">,
  secret: string,
  now = new Date(),
): string {
  if (secret.length < 32)
    throw new TypeError("Slack OAuth state secret must be at least 32 characters");
  const payload: SlackOAuthState = {
    ...input,
    expiresAt: Math.floor(now.getTime() / 1_000) + 600,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmacDigest(encoded, secret).toString("base64url")}`;
}

export function verifySlackOAuthState(
  value: string,
  secret: string,
  expected: Pick<SlackOAuthState, "organizationId" | "membershipId">,
  now = new Date(),
): SlackOAuthState | null {
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra || secret.length < 32) return null;
  const supplied = Buffer.from(signature, "base64url");
  const wanted = hmacDigest(encoded, secret);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) return null;
  try {
    const parsed = z
      .strictObject({
        organizationId: z.uuid(),
        membershipId: z.uuid(),
        channelId: z.string().min(1).max(100),
        expiresAt: z.number().int().positive(),
        nonce: z.string().min(20).max(30),
      })
      .parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (
      parsed.organizationId !== expected.organizationId ||
      parsed.membershipId !== expected.membershipId ||
      parsed.expiresAt < Math.floor(now.getTime() / 1_000)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function exchangeSlackOAuthCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof globalThis.fetch;
}) {
  const response = await (input.fetch ?? globalThis.fetch)(
    "https://slack.com/api/oauth.v2.access",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
      }),
    },
  );
  if (!response.ok) throw new Error(`Slack OAuth exchange failed (${response.status})`);
  const result = z
    .object({
      ok: z.boolean(),
      error: z.string().optional(),
      access_token: z.string().startsWith("xoxb-").optional(),
      scope: z.string().default(""),
      team: z.object({ id: z.string().min(1), name: z.string().min(1) }).optional(),
    })
    .parse(await response.json());
  if (!result.ok || !result.access_token || !result.team) {
    throw new Error(`Slack OAuth exchange was rejected (${result.error ?? "invalid_response"})`);
  }
  const scopes = result.scope.split(",").filter(Boolean);
  if (!scopes.includes("chat:write")) {
    throw new Error("Slack OAuth response did not grant chat:write");
  }
  return {
    botToken: result.access_token,
    teamId: result.team.id,
    teamName: result.team.name,
    scopes,
  };
}

export interface VerifiedWebhook<TPayload> {
  deliveryId: string;
  receivedAt: string;
  payload: TPayload;
}

export const GITHUB_API_VERSION = "2026-03-10";

export function verifyGitHubWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader.startsWith("sha256=") || secret.length < 16) return false;
  const supplied = Buffer.from(signatureHeader.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

export function createGitHubAppJwt(appId: string, privateKey: string, now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1_000) - 60;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iat: issuedAt,
    exp: issuedAt + 600,
    iss: appId,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

export async function createGitHubInstallationToken(input: {
  appId: string;
  privateKey: string;
  installationId: bigint;
  fetch?: typeof globalThis.fetch;
}): Promise<{ token: string; expiresAt: Date }> {
  const fetcher = input.fetch ?? globalThis.fetch;
  const response = await fetcher(
    `https://api.github.com/app/installations/${input.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${createGitHubAppJwt(input.appId, input.privateKey)}`,
        "user-agent": "Hyrum-Control-Plane",
        "x-github-api-version": GITHUB_API_VERSION,
      },
    },
  );
  if (!response.ok)
    throw new Error(`GitHub installation token request failed (${response.status})`);
  const parsed = z
    .object({ token: z.string().min(1), expires_at: z.iso.datetime() })
    .parse(await response.json());
  return { token: parsed.token, expiresAt: new Date(parsed.expires_at) };
}

export type GitHubGateOutcome = "block" | "warn" | "note" | "pass";

export function buildGitHubCheckPayload(input: {
  externalId: string;
  headSha: string;
  detailsUrl: string;
  outcome: GitHubGateOutcome;
  blockingImpactCount: number;
  warningImpactCount: number;
  notedImpactCount: number;
}) {
  const conclusion =
    input.outcome === "block" ? "failure" : input.outcome === "warn" ? "neutral" : "success";
  return {
    name: "Hyrum compatibility gate",
    head_sha: input.headSha,
    status: "completed" as const,
    conclusion,
    external_id: input.externalId,
    details_url: input.detailsUrl,
    output: {
      title: `Compatibility gate: ${input.outcome}`,
      summary: [
        `${input.blockingImpactCount} blocking impact(s)`,
        `${input.warningImpactCount} warning impact(s)`,
        `${input.notedImpactCount} noted impact(s)`,
      ].join(" · "),
    },
  };
}

export async function publishGitHubCheckRun(input: {
  owner: string;
  repository: string;
  installationToken: string;
  payload: ReturnType<typeof buildGitHubCheckPayload>;
  existingCheckRunId?: bigint | null;
  fetch?: typeof globalThis.fetch;
}): Promise<{ id: bigint }> {
  const fetcher = input.fetch ?? globalThis.fetch;
  const endpoint = input.existingCheckRunId
    ? `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/check-runs/${input.existingCheckRunId}`
    : `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/check-runs`;
  const response = await fetcher(endpoint, {
    method: input.existingCheckRunId ? "PATCH" : "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.installationToken}`,
      "content-type": "application/json",
      "user-agent": "Hyrum-Control-Plane",
      "x-github-api-version": GITHUB_API_VERSION,
    },
    body: JSON.stringify(input.payload),
  });
  if (!response.ok) throw new Error(`GitHub check publication failed (${response.status})`);
  const result = z.object({ id: z.number().int().positive() }).parse(await response.json());
  return { id: BigInt(result.id) };
}

function integrationDataKey(masterKeyHex: string, organizationId: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex))
    throw new TypeError("Invalid integration encryption key");
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(masterKeyHex, "hex"),
      Buffer.from(organizationId),
      Buffer.from("hyrum/integration-token/v1"),
      32,
    ),
  );
}

export function encryptIntegrationToken(
  token: string,
  organizationId: string,
  masterKeyHex: string,
): string {
  if (!token) throw new TypeError("Integration token is required");
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    integrationDataKey(masterKeyHex, organizationId),
    iv,
  );
  cipher.setAAD(Buffer.from(organizationId));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptIntegrationToken(
  encoded: string,
  organizationId: string,
  masterKeyHex: string,
): string {
  const [version, iv, tag, ciphertext] = encoded.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new TypeError("Invalid encrypted token envelope");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    integrationDataKey(masterKeyHex, organizationId),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(organizationId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function verifySlackWebhookSignature(input: {
  rawBody: string | Buffer;
  timestamp: string;
  signature: string;
  signingSecret: string;
  now?: Date;
}): boolean {
  const timestamp = Number(input.timestamp);
  if (
    !Number.isInteger(timestamp) ||
    Math.abs((input.now ?? new Date()).getTime() / 1_000 - timestamp) > 300 ||
    !input.signature.startsWith("v0=")
  )
    return false;
  const expected = createHmac("sha256", input.signingSecret)
    .update(`v0:${input.timestamp}:`)
    .update(input.rawBody)
    .digest();
  const supplied = Buffer.from(input.signature.slice(3), "hex");
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

export async function publishSlackNotification(input: {
  botToken: string;
  channelId: string;
  title: string;
  bodyText: string;
  deepLinkUrl?: string | null;
  clientMessageId: string;
  fetch?: typeof globalThis.fetch;
}): Promise<{ messageId: string }> {
  const response = await (input.fetch ?? globalThis.fetch)(
    "https://slack.com/api/chat.postMessage",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.botToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: input.channelId,
        client_msg_id: input.clientMessageId,
        text: `${input.title}\n${input.bodyText}${input.deepLinkUrl ? `\nReview: ${input.deepLinkUrl}` : ""}`,
        unfurl_links: false,
        unfurl_media: false,
      }),
    },
  );
  const parsed = z
    .object({ ok: z.boolean(), ts: z.string().optional(), error: z.string().optional() })
    .parse(await response.json());
  if (!response.ok || !parsed.ok || !parsed.ts) {
    throw new Error(`Slack notification failed (${parsed.error ?? response.status})`);
  }
  return { messageId: parsed.ts };
}
