import { createHash } from "node:crypto";
import { webhookAcceptedSchema } from "@hyrum/contracts";
import { claimWebhookDelivery, finishProviderWebhook } from "@hyrum/db";
import { verifySlackWebhookSignature } from "@hyrum/integrations";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const slackEnvelopeSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("url_verification"), challenge: z.string().min(1).max(1_000) })
    .loose(),
  z
    .object({
      type: z.literal("event_callback"),
      event_id: z.string().min(1).max(200),
      event: z.object({ type: z.string().min(1).max(100) }).loose(),
    })
    .loose(),
]);

export const slackWebhookRoutes: FastifyPluginAsyncZod<{
  signingSecret: string | undefined;
}> = async (app, options) => {
  app.post(
    "/webhooks/slack",
    {
      config: { rawBody: true },
      schema: {
        tags: ["webhooks"],
        headers: z
          .object({
            "x-slack-request-timestamp": z.string().regex(/^\d+$/),
            "x-slack-signature": z.string().startsWith("v0="),
          })
          .loose(),
        body: z.unknown(),
        response: {
          200: z.object({ challenge: z.string() }),
          202: webhookAcceptedSchema,
        },
      },
    },
    async (request, reply) => {
      if (!options.signingSecret) {
        throw app.httpErrors.serviceUnavailable("Slack webhooks are not configured");
      }
      if (typeof request.rawBody !== "string") {
        throw app.httpErrors.badRequest("Raw webhook body is unavailable");
      }
      if (
        !verifySlackWebhookSignature({
          rawBody: request.rawBody,
          timestamp: request.headers["x-slack-request-timestamp"],
          signature: request.headers["x-slack-signature"],
          signingSecret: options.signingSecret,
        })
      ) {
        throw app.httpErrors.unauthorized("Invalid Slack webhook signature");
      }
      const payload = slackEnvelopeSchema.parse(JSON.parse(request.rawBody));
      if (payload.type === "url_verification") {
        return reply.code(200).send({ challenge: payload.challenge });
      }
      const claimed = await claimWebhookDelivery(app.database.sql, {
        provider: "slack",
        deliveryId: payload.event_id,
        eventType: payload.event.type,
        payloadDigest: createHash("sha256").update(request.rawBody).digest("hex"),
      });
      if (!claimed) return reply.code(202).send({ received: true, duplicate: true });
      await finishProviderWebhook(app.database, {
        provider: "slack",
        deliveryId: payload.event_id,
        organizationId: null,
        status: "ignored",
        errorCode: null,
      });
      return reply.code(202).send({ received: true, duplicate: false });
    },
  );
};
