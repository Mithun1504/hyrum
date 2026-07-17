import {
  type ClaimedJob,
  type DatabaseTransaction,
  markSlackNotificationSent,
  prepareSlackNotificationDelivery,
} from "@hyrum/db";
import { decryptIntegrationToken, publishSlackNotification } from "@hyrum/integrations";
import { z } from "zod";
import type { JobHandler } from "../runner";

const payloadSchema = z.strictObject({ notificationDeliveryId: z.uuid() });

export function createDeliverSlackNotificationHandler(config: {
  encryptionKey: string | undefined;
  webUrl: string;
}): JobHandler {
  return async (job: ClaimedJob, context) => {
    if (!context.organizationId) throw new Error("Slack jobs must be tenant scoped");
    if (!config.encryptionKey) throw new Error("Integration token encryption is not configured");
    const { notificationDeliveryId } = payloadSchema.parse(job.payload);
    const tx = context.db as DatabaseTransaction;
    const delivery = await prepareSlackNotificationDelivery(
      tx,
      context.organizationId,
      notificationDeliveryId,
    );
    if (!delivery) return;
    const result = await publishSlackNotification({
      botToken: decryptIntegrationToken(
        delivery.encryptedBotToken,
        context.organizationId,
        config.encryptionKey,
      ),
      channelId: delivery.channelId,
      title: delivery.title,
      bodyText: delivery.bodyText,
      deepLinkUrl: delivery.deepLinkPath
        ? `${config.webUrl.replace(/\/$/, "")}${delivery.deepLinkPath}`
        : null,
      clientMessageId: delivery.id,
    });
    await markSlackNotificationSent(tx, context.organizationId, delivery.id, result.messageId);
  };
}
