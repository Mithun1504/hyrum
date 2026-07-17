import { and, eq } from "drizzle-orm";
import { jobs, outboxEvents } from "./schema";
import type { TenantDb } from "./tenant";

export async function enqueueOutboxEvent(
  tx: TenantDb,
  input: {
    organizationId: string;
    topic: string;
    payload: unknown;
    idempotencyKey: string;
  },
): Promise<string> {
  const [inserted] = await tx
    .insert(outboxEvents)
    .values(input)
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    })
    .returning({ id: outboxEvents.id });
  const [event] = inserted
    ? [inserted]
    : await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, input.organizationId),
            eq(outboxEvents.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
  if (!event) throw new Error("Failed to enqueue outbox event");

  await tx
    .insert(jobs)
    .values({
      organizationId: input.organizationId,
      type: "outbox.publish",
      payload: { outbox_event_id: event.id },
      idempotencyKey: `outbox:${input.idempotencyKey}`,
    })
    .onConflictDoNothing({ target: [jobs.organizationId, jobs.idempotencyKey] });
  return event.id;
}
