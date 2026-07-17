import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { enqueueOutboxEvent } from "./outbox";

describe("enqueueOutboxEvent", () => {
  it("writes the event and its retry job through the caller transaction", async () => {
    const writes: { table: string; value: unknown }[] = [];
    const tx = {
      insert: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
        values: (value: unknown) => {
          writes.push({ table: getTableName(table), value });
          const chain = {
            onConflictDoNothing: vi.fn(() => chain),
            returning: vi.fn(async () => [{ id: "00000000-0000-4000-8000-000000000041" }]),
          };
          return chain;
        },
      })),
    };

    await enqueueOutboxEvent(tx as never, {
      organizationId: "00000000-0000-4000-8000-000000000001",
      topic: "capture.batch_ingested",
      payload: { accepted_count: 1 },
      idempotencyKey: "capture:batch_1",
    });

    expect(writes.map((write) => write.table)).toEqual(["outbox_events", "jobs"]);
    expect(writes[1]?.value).toMatchObject({
      type: "outbox.publish",
      payload: { outbox_event_id: "00000000-0000-4000-8000-000000000041" },
      idempotencyKey: "outbox:capture:batch_1",
    });
  });
});
