import { describe, expect, it } from "vitest";
import { clusterAndNameBehaviors } from "./index";

describe.skipIf(process.env.HYRUM_RUN_LIVE_OPENAI !== "1")("live OpenAI structured output", () => {
  it("returns receipt-bound behavior clusters without retaining the request", async () => {
    const result = await clusterAndNameBehaviors({
      receiptIds: ["live-safe-receipt"],
      redactedEvidence: [
        { behavior_id: "behavior-1", kind: "shape", path: "$.result.next_cursor" },
      ],
      behaviors: [{ id: "behavior-1", kind: "shape", path: "$.result.next_cursor" }],
    });
    expect(result.result.receiptIds.every((id) => id === "live-safe-receipt")).toBe(true);
  }, 30_000);
});
