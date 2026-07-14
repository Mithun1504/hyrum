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

export interface VerifiedWebhook<TPayload> {
  deliveryId: string;
  receivedAt: string;
  payload: TPayload;
}
