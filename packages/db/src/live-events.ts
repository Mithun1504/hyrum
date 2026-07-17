import { and, asc, eq, gt, or } from "drizzle-orm";
import type { Database } from "./index";
import { outboxEvents } from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface LiveEventRecord {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  eventVersion: number;
  createdAt: Date;
}

/**
 * Read sanitized event metadata after a tenant-owned cursor. Payloads are intentionally excluded so
 * SSE can never expose receipt contents, request data, integration credentials, or model prompts.
 */
export async function listLiveEvents(
  db: Database,
  organizationId: string,
  cursorId?: string,
  limit = 100,
): Promise<LiveEventRecord[]> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    let cursor: { id: string; createdAt: Date } | undefined;
    if (cursorId) {
      [cursor] = await tx
        .select({ id: outboxEvents.id, createdAt: outboxEvents.createdAt })
        .from(outboxEvents)
        .where(and(eq(outboxEvents.organizationId, organizationId), eq(outboxEvents.id, cursorId)))
        .limit(1);
      if (!cursor) return [];
    }
    return tx
      .select({
        id: outboxEvents.id,
        topic: outboxEvents.topic,
        aggregateType: outboxEvents.aggregateType,
        aggregateId: outboxEvents.aggregateId,
        eventVersion: outboxEvents.eventVersion,
        createdAt: outboxEvents.createdAt,
      })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, organizationId),
          cursor
            ? or(
                gt(outboxEvents.createdAt, cursor.createdAt),
                and(eq(outboxEvents.createdAt, cursor.createdAt), gt(outboxEvents.id, cursor.id)),
              )
            : gt(outboxEvents.createdAt, new Date(Date.now() - 60_000)),
        ),
      )
      .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
      .limit(Math.min(Math.max(limit, 1), 100));
  });
}
