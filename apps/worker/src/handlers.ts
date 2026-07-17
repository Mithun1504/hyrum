import { assertionExpiryJobPayloadSchema, progressEventTopic } from "@hyrum/contracts";
import {
  and,
  asc,
  assertions,
  dependencyClaims,
  eq,
  githubRepositories,
  isNull,
  jobs,
  ledgerEntries,
  lte,
  outboxEvents,
  progressEvents,
  receipts,
  slackChannels,
  sql,
} from "@hyrum/db";
import {
  gateIntegrationEventSchema,
  gateIntegrationOutboxEventSchema,
  publishGitHubCheckRun,
  publishSlackGateNotification,
} from "@hyrum/integrations";
import type { S3ObjectStorage } from "@hyrum/storage";
import { z } from "zod";
import type { JobHandler } from "./runner";

const outboxJobPayloadSchema = z.object({ outbox_event_id: z.uuid() }).strict();
const progressOutboxPayloadSchema = z
  .object({ resource_id: z.string().min(1), payload: z.unknown() })
  .strict();
const cleanupPayloadSchema = z
  .object({ limit: z.number().int().min(1).max(1_000).default(100) })
  .strict();

export interface WorkerHandlerOptions {
  objectStorage?: Pick<S3ObjectStorage, "deleteObject">;
  githubApp?: { appId: string; privateKey: string };
  slackBotToken?: string;
}

export function createDefaultHandlers(
  options: WorkerHandlerOptions = {},
): ReadonlyMap<string, JobHandler> {
  return new Map<string, JobHandler>([
    [
      "assertions.expire",
      async (job, db) => {
        const now = new Date();
        const { assertion_id: assertionId } = assertionExpiryJobPayloadSchema.parse(job.payload);
        const expired = await db
          .update(assertions)
          .set({ status: "expired" })
          .where(
            and(
              eq(assertions.organizationId, job.organizationId),
              eq(assertions.id, assertionId),
              eq(assertions.status, "active"),
              lte(assertions.expiresAt, now),
            ),
          )
          .returning({ id: assertions.id });
        for (const row of expired) {
          await db.insert(progressEvents).values({
            organizationId: job.organizationId,
            topic: progressEventTopic.assertionExpired,
            resourceId: row.id,
            payload: {},
          });
        }
      },
    ],
    [
      "receipts.cleanup",
      async (job, db) => {
        if (!options.objectStorage)
          throw new Error("Object storage is required for receipt cleanup");
        const { limit } = cleanupPayloadSchema.parse(job.payload);
        const expired = await db
          .select({ id: receipts.id, objectKey: receipts.objectKey })
          .from(receipts)
          .where(
            and(
              eq(receipts.organizationId, job.organizationId),
              lte(receipts.expiresAt, new Date()),
              sql`${receipts.objectKey} IS NOT NULL`,
            ),
          )
          .limit(limit);

        for (const receipt of expired) {
          if (receipt.objectKey) {
            await options.objectStorage.deleteObject({
              organizationId: job.organizationId,
              key: receipt.objectKey,
            });
          }
          await db
            .update(receipts)
            .set({
              objectKey: null,
              excerpt: { unavailable: true, reason: "retention_expired" },
              updatedAt: new Date(),
            })
            .where(
              and(eq(receipts.organizationId, job.organizationId), eq(receipts.id, receipt.id)),
            );
        }

        if (expired.length === limit) {
          await db
            .insert(jobs)
            .values({
              organizationId: job.organizationId,
              type: "receipts.cleanup",
              payload: { limit },
              idempotencyKey: `receipts.cleanup:followup:${job.id}`,
            })
            .onConflictDoNothing({ target: [jobs.organizationId, jobs.idempotencyKey] });
        }
      },
    ],
    [
      "ledger.freshness",
      async (job, db) => {
        const { limit } = cleanupPayloadSchema.parse(job.payload);
        const now = new Date();
        const expired = await db
          .select({ id: ledgerEntries.id, claimId: ledgerEntries.claimId })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.organizationId, job.organizationId),
              eq(ledgerEntries.state, "active"),
              lte(ledgerEntries.freshnessUntil, now),
            ),
          )
          .limit(limit);

        if (expired.length > 0) {
          const entryIds = expired.map(({ id }) => id);
          const selectedClaimIds = expired.map(({ claimId }) => claimId);
          await db
            .select({ id: dependencyClaims.id })
            .from(dependencyClaims)
            .where(
              and(
                eq(dependencyClaims.organizationId, job.organizationId),
                sql`${dependencyClaims.id} in (${sql.join(
                  selectedClaimIds.map((id) => sql`${id}::uuid`),
                  sql`, `,
                )})`,
              ),
            )
            .for("update");
          const staleEntries = await db
            .update(ledgerEntries)
            .set({ state: "stale", updatedAt: new Date() })
            .where(
              and(
                eq(ledgerEntries.organizationId, job.organizationId),
                eq(ledgerEntries.state, "active"),
                lte(ledgerEntries.freshnessUntil, now),
                sql`${ledgerEntries.id} in (${sql.join(
                  entryIds.map((id) => sql`${id}::uuid`),
                  sql`, `,
                )})`,
              ),
            )
            .returning({ claimId: ledgerEntries.claimId });
          if (staleEntries.length > 0) {
            const claimIds = staleEntries.map(({ claimId }) => claimId);
            await db
              .update(dependencyClaims)
              .set({ state: "stale", updatedAt: new Date() })
              .where(
                and(
                  eq(dependencyClaims.organizationId, job.organizationId),
                  eq(dependencyClaims.state, "active"),
                  sql`${dependencyClaims.id} in (${sql.join(
                    claimIds.map((id) => sql`${id}::uuid`),
                    sql`, `,
                  )})`,
                ),
              );
          }
        }

        const [next] = await db
          .select({ freshnessUntil: ledgerEntries.freshnessUntil })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.organizationId, job.organizationId),
              eq(ledgerEntries.state, "active"),
            ),
          )
          .orderBy(asc(ledgerEntries.freshnessUntil))
          .limit(1);
        if (next) {
          const runAfter = next.freshnessUntil > now ? next.freshnessUntil : now;
          await db
            .insert(jobs)
            .values({
              organizationId: job.organizationId,
              type: "ledger.freshness",
              payload: { limit },
              runAfter,
              idempotencyKey: `ledger.freshness:followup:${job.id}`,
            })
            .onConflictDoUpdate({
              target: [jobs.organizationId, jobs.idempotencyKey],
              set: {
                status: "pending",
                attempts: 0,
                runAfter,
                leaseOwner: null,
                leaseExpiresAt: null,
                lastError: null,
                updatedAt: new Date(),
              },
            });
        }
      },
    ],
    [
      "outbox.publish",
      async (job, db) => {
        const { outbox_event_id: eventId } = outboxJobPayloadSchema.parse(job.payload);
        const [event] = await db
          .select({ topic: outboxEvents.topic, payload: outboxEvents.payload })
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.organizationId, job.organizationId),
              eq(outboxEvents.id, eventId),
              isNull(outboxEvents.publishedAt),
            ),
          )
          .limit(1);
        if (!event) return;

        if (
          event.topic === progressEventTopic.captureBatchIngested ||
          event.topic === progressEventTopic.ledgerUpdated
        ) {
          const payload = progressOutboxPayloadSchema.parse(event.payload);
          await db.insert(progressEvents).values({
            organizationId: job.organizationId,
            topic: event.topic,
            resourceId: payload.resource_id,
            payload: payload.payload,
          });
        } else if (event.topic === "integration.gate_decided") {
          const payload = gateIntegrationOutboxEventSchema.parse(event.payload);
          if (payload.github) {
            if (!options.githubApp) throw new Error("GitHub App credentials are not configured");
            const [destination] = await db
              .select({
                installationId: githubRepositories.installationId,
                owner: githubRepositories.owner,
                name: githubRepositories.name,
              })
              .from(githubRepositories)
              .where(
                and(
                  eq(githubRepositories.organizationId, job.organizationId),
                  eq(githubRepositories.id, payload.github.integrationId),
                  eq(githubRepositories.active, true),
                ),
              )
              .limit(1);
            if (!destination) throw new Error("GitHub integration is not active for this tenant");
            const delivery = gateIntegrationEventSchema.parse({
              ...payload,
              github: {
                installationId: destination.installationId,
                headSha: payload.github.headSha,
                repository: { owner: destination.owner, name: destination.name },
                pullRequest: payload.github.pullRequest,
              },
            });
            if (!delivery.github) throw new Error("GitHub delivery is missing its destination");
            await publishGitHubCheckRun(
              { ...delivery, github: delivery.github },
              options.githubApp,
            );
          }
          if (payload.slack) {
            if (!options.slackBotToken) throw new Error("Slack bot token is not configured");
            const [destination] = await db
              .select({ channel: slackChannels.channelId })
              .from(slackChannels)
              .where(
                and(
                  eq(slackChannels.organizationId, job.organizationId),
                  eq(slackChannels.id, payload.slack.integrationId),
                  eq(slackChannels.active, true),
                ),
              )
              .limit(1);
            if (!destination) throw new Error("Slack integration is not active for this tenant");
            const delivery = gateIntegrationEventSchema.parse({
              ...payload,
              slack: { channel: destination.channel },
            });
            if (!delivery.slack) throw new Error("Slack delivery is missing its destination");
            await publishSlackGateNotification(
              { ...delivery, slack: delivery.slack },
              options.slackBotToken,
            );
          }
        } else {
          throw new Error(`Unsupported outbox topic: ${event.topic}`);
        }

        await db
          .update(outboxEvents)
          .set({ attempts: job.attempts, publishedAt: new Date() })
          .where(
            and(
              eq(outboxEvents.organizationId, job.organizationId),
              eq(outboxEvents.id, eventId),
              isNull(outboxEvents.publishedAt),
            ),
          );
      },
    ],
  ]);
}
