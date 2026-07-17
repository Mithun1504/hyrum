import { createHash } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  apiServices,
  assertionEvents,
  assertions,
  jobs,
  notifications,
  outboxEvents,
} from "./schema";
import type { DatabaseTransaction } from "./tenancy";

async function appendEvent(
  tx: DatabaseTransaction,
  organizationId: string,
  assertionId: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const [events] = await tx
    .select({ value: count() })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, organizationId),
        eq(outboxEvents.aggregateType, "assertion"),
        eq(outboxEvents.aggregateId, assertionId),
      ),
    );
  await tx.insert(outboxEvents).values({
    organizationId,
    topic,
    aggregateType: "assertion",
    aggregateId: assertionId,
    eventVersion: Number(events?.value ?? 0) + 1,
    payload,
    payloadDigest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  });
}

async function findAssertion(tx: DatabaseTransaction, organizationId: string, assertionId: string) {
  const [record] = await tx
    .select({
      id: assertions.id,
      apiServiceId: assertions.apiServiceId,
      ownerMembershipId: assertions.ownerMembershipId,
      expiresAt: assertions.expiresAt,
      status: assertions.status,
      serviceSlug: apiServices.slug,
    })
    .from(assertions)
    .innerJoin(
      apiServices,
      and(
        eq(apiServices.organizationId, assertions.organizationId),
        eq(apiServices.id, assertions.apiServiceId),
      ),
    )
    .where(and(eq(assertions.organizationId, organizationId), eq(assertions.id, assertionId)))
    .limit(1);
  return record;
}

export async function remindAssertionExpiry(
  tx: DatabaseTransaction,
  organizationId: string,
  assertionId: string,
): Promise<boolean> {
  const assertion = await findAssertion(tx, organizationId, assertionId);
  if (!assertion || !(assertion.status === "active" || assertion.status === "expiring"))
    return false;
  if (assertion.expiresAt <= new Date()) return false;
  await tx
    .update(assertions)
    .set({ status: "expiring", updatedAt: new Date() })
    .where(
      and(
        eq(assertions.organizationId, organizationId),
        eq(assertions.id, assertionId),
        inArray(assertions.status, ["active", "expiring"]),
      ),
    );
  const [notification] = await tx
    .insert(notifications)
    .values({
      organizationId,
      targetMembershipId: assertion.ownerMembershipId,
      apiServiceId: assertion.apiServiceId,
      assertionId,
      eventType: "assertion.expiring",
      severity: "warning",
      title: "Compatibility assertion is expiring",
      bodyText: `Review this assertion before ${assertion.expiresAt.toISOString()}. It will not extend automatically.`,
      deepLinkPath: `/app/${assertion.serviceSlug}/assertions`,
      deduplicationKey: `assertion:${assertionId}:expiring:${assertion.expiresAt.toISOString()}`,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  if (notification) {
    await tx.insert(jobs).values({
      organizationId,
      type: "route_notification",
      payload: { notificationId: notification.id },
      idempotencyKey: `route-notification:${notification.id}`,
      concurrencyKey: `notification:${organizationId}`,
    });
  }
  await appendEvent(tx, organizationId, assertionId, "assertion.expiring", {
    assertionId,
    expiresAt: assertion.expiresAt.toISOString(),
  });
  return true;
}

export async function expireAssertion(
  tx: DatabaseTransaction,
  organizationId: string,
  assertionId: string,
): Promise<boolean> {
  const assertion = await findAssertion(tx, organizationId, assertionId);
  if (!assertion || !(assertion.status === "active" || assertion.status === "expiring"))
    return false;
  const now = new Date();
  if (assertion.expiresAt > now) return false;
  const [expired] = await tx
    .update(assertions)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(assertions.organizationId, organizationId),
        eq(assertions.id, assertionId),
        inArray(assertions.status, ["active", "expiring"]),
      ),
    )
    .returning({ id: assertions.id });
  if (!expired) return false;
  const [notification] = await tx
    .insert(notifications)
    .values({
      organizationId,
      targetMembershipId: assertion.ownerMembershipId,
      apiServiceId: assertion.apiServiceId,
      assertionId,
      eventType: "assertion.expired",
      severity: "warning",
      title: "Compatibility assertion expired",
      bodyText: "This assertion expired and is no longer an active replay commitment.",
      deepLinkPath: `/app/${assertion.serviceSlug}/assertions`,
      deduplicationKey: `assertion:${assertionId}:expired`,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  await Promise.all([
    tx.insert(assertionEvents).values({
      organizationId,
      assertionId,
      eventType: "expired",
      actorType: "system",
      actorId: "worker",
      reason: "Assertion reached its explicit expiry without extension.",
      previousExpiry: assertion.expiresAt,
      metadata: {},
    }),
    appendEvent(tx, organizationId, assertionId, "assertion.expired", {
      assertionId,
      expiredAt: now.toISOString(),
    }),
  ]);
  if (notification) {
    await tx.insert(jobs).values({
      organizationId,
      type: "route_notification",
      payload: { notificationId: notification.id },
      idempotencyKey: `route-notification:${notification.id}`,
      concurrencyKey: `notification:${organizationId}`,
    });
  }
  return true;
}
