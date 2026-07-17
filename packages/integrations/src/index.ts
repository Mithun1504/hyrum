import { createHmac, timingSafeEqual } from "node:crypto";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { WebClient } from "@slack/web-api";
import { z } from "zod";

export const githubAppConfigSchema = z
  .object({
    appId: z.string().min(1),
    privateKey: z.string().min(1),
    webhookSecret: z.string().min(16),
  })
  .strict();

export const slackAppConfigSchema = z
  .object({
    signingSecret: z.string().min(16),
    botToken: z.string().startsWith("xoxb-").optional(),
  })
  .strict();

export interface VerifiedWebhook<TPayload> {
  deliveryId: string;
  receivedAt: string;
  payload: TPayload;
}

function matchesSignature(expected: string, supplied: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export function verifyGitHubWebhook(
  rawBody: Buffer,
  suppliedSignature: string | undefined,
  secret: string,
): boolean {
  if (!suppliedSignature?.startsWith("sha256=") || secret.length < 16) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return matchesSignature(expected, suppliedSignature);
}

export function verifySlackRequest(
  rawBody: Buffer,
  timestamp: string | undefined,
  suppliedSignature: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  const parsedTimestamp = Number(timestamp);
  if (
    !Number.isInteger(parsedTimestamp) ||
    Math.abs(nowSeconds - parsedTimestamp) > 300 ||
    !suppliedSignature?.startsWith("v0=") ||
    secret.length < 16
  ) {
    return false;
  }
  const base = `v0:${parsedTimestamp}:${rawBody.toString("utf8")}`;
  const expected = `v0=${createHmac("sha256", secret).update(base).digest("hex")}`;
  return matchesSignature(expected, suppliedSignature);
}

export const gateDecisionSchema = z
  .object({
    outcome: z.enum(["pass", "warn", "block"]),
    blockCount: z.number().int().nonnegative(),
    warnCount: z.number().int().nonnegative(),
    noteCount: z.number().int().nonnegative(),
    reasons: z.array(z.string().min(1)).max(100),
  })
  .strict();

export const githubCheckRunFixtureSchema = z
  .object({
    name: z.literal("Hyrum accidental-contract gate"),
    head_sha: z.string().min(7),
    status: z.literal("completed"),
    conclusion: z.enum(["success", "neutral", "failure"]),
    external_id: z.string().min(1),
    output: z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      text: z.string().min(1),
    }),
  })
  .strict();

export type GateDecision = z.infer<typeof gateDecisionSchema>;
export type GitHubCheckRunFixture = z.infer<typeof githubCheckRunFixtureSchema>;

export const gateIntegrationEventSchema = z
  .object({
    reportId: z.uuid(),
    detailsUrl: z.url(),
    decision: gateDecisionSchema,
    github: z
      .object({
        installationId: z.number().int().positive(),
        headSha: z.string().regex(/^[a-f0-9]{7,64}$/),
        repository: z.object({ owner: z.string().min(1), name: z.string().min(1) }).strict(),
        pullRequest: z.number().int().positive(),
      })
      .strict()
      .optional(),
    slack: z
      .object({ channel: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict()
  .refine((event) => event.github || event.slack, {
    message: "At least one integration destination is required",
  });

export type GateIntegrationEvent = z.infer<typeof gateIntegrationEventSchema>;

export const gateIntegrationOutboxEventSchema = z
  .object({
    reportId: z.uuid(),
    detailsUrl: z.url(),
    decision: gateDecisionSchema,
    github: z
      .object({
        integrationId: z.uuid(),
        headSha: z.string().regex(/^[a-f0-9]{7,64}$/),
        pullRequest: z.number().int().positive(),
      })
      .strict()
      .optional(),
    slack: z.object({ integrationId: z.uuid() }).strict().optional(),
  })
  .strict()
  .refine((event) => event.github || event.slack, {
    message: "At least one authorized integration is required",
  });

export type GateIntegrationOutboxEvent = z.infer<typeof gateIntegrationOutboxEventSchema>;

export function createGitHubCheckRunFixture(input: {
  reportId: string;
  headSha: string;
  decision: GateDecision;
  detailsUrl?: string;
}): GitHubCheckRunFixture {
  const decision = gateDecisionSchema.parse(input.decision);
  const conclusion =
    decision.outcome === "block" ? "failure" : decision.outcome === "warn" ? "neutral" : "success";
  const title =
    decision.outcome === "block"
      ? "Blocked by proven echo evidence"
      : decision.outcome === "warn"
        ? "Passed with pattern-evidence warnings"
        : "No blocking accidental-contract changes";
  const summary = [
    `${decision.blockCount} blocking T1 match${decision.blockCount === 1 ? "" : "es"}`,
    `${decision.warnCount} T2 warning${decision.warnCount === 1 ? "" : "s"}`,
    `${decision.noteCount} T3 exposure note${decision.noteCount === 1 ? "" : "s"}`,
  ].join(" · ");
  const reasons =
    decision.reasons.map((reason) => `- ${reason}`).join("\n") || "- No matched deltas.";
  const link = input.detailsUrl ? `\n\n[Open the signed replay report](${input.detailsUrl})` : "";

  return githubCheckRunFixtureSchema.parse({
    name: "Hyrum accidental-contract gate",
    head_sha: input.headSha,
    status: "completed",
    conclusion,
    external_id: input.reportId,
    output: { title, summary, text: `${reasons}${link}` },
  });
}

export function createSlackGateNotification(input: {
  repository: string;
  pullRequest: number;
  decision: GateDecision;
  detailsUrl: string;
}) {
  const decision = gateDecisionSchema.parse(input.decision);
  const status = decision.outcome === "block" ? "blocked" : decision.outcome;
  return {
    text: `Hyrum ${status} ${input.repository}#${input.pullRequest}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Hyrum ${status}* <${input.detailsUrl}|${input.repository}#${input.pullRequest}>\n${decision.blockCount} T1 blocks · ${decision.warnCount} T2 warnings · ${decision.noteCount} T3 notes`,
        },
      },
    ],
  } as const;
}

export async function publishGitHubCheckRun(
  input: GateIntegrationEvent & { github: NonNullable<GateIntegrationEvent["github"]> },
  config: { appId: string; privateKey: string },
  octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { ...config, installationId: input.github.installationId },
  }),
): Promise<void> {
  const event = gateIntegrationEventSchema.parse(input);
  if (!event.github) throw new Error("GitHub destination is required");
  const check = createGitHubCheckRunFixture({
    reportId: event.reportId,
    headSha: event.github.headSha,
    decision: event.decision,
    detailsUrl: event.detailsUrl,
  });
  const repository = { owner: event.github.repository.owner, repo: event.github.repository.name };
  const existing = await octokit.rest.checks.listForRef({
    ...repository,
    ref: event.github.headSha,
    check_name: check.name,
    per_page: 100,
  });
  const prior = existing.data.check_runs.find((run) => run.external_id === check.external_id);

  if (prior) {
    await octokit.rest.checks.update({
      ...repository,
      check_run_id: prior.id,
      status: check.status,
      conclusion: check.conclusion,
      external_id: check.external_id,
      output: check.output,
    });
    return;
  }
  await octokit.rest.checks.create({ ...repository, ...check });
}

export async function publishSlackGateNotification(
  input: GateIntegrationEvent & { slack: NonNullable<GateIntegrationEvent["slack"]> },
  botToken: string,
  client = new WebClient(botToken),
): Promise<void> {
  const event = gateIntegrationEventSchema.parse(input);
  if (!event.slack) throw new Error("Slack destination is required");
  const message = event.github
    ? createSlackGateNotification({
        repository: `${event.github.repository.owner}/${event.github.repository.name}`,
        pullRequest: event.github.pullRequest,
        decision: event.decision,
        detailsUrl: event.detailsUrl,
      })
    : {
        text: `Hyrum ${event.decision.outcome} replay ${event.reportId.slice(0, 8)}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Hyrum ${event.decision.outcome}* <${event.detailsUrl}|Open replay report>\n${event.decision.blockCount} T1 blocks · ${event.decision.warnCount} T2 warnings · ${event.decision.noteCount} T3 notes`,
            },
          },
        ],
      };
  const result = await client.apiCall("chat.postMessage", {
    channel: event.slack.channel,
    client_msg_id: event.reportId,
    unfurl_links: false,
    ...message,
  });
  if (!result.ok) throw new Error("Slack rejected the gate notification");
}
