import { describe, expect, it } from "vitest";
import { processedCaptureSessionSchema } from "./agents";

const hmac = `hmac-sha256:${"a".repeat(64)}`;
const session = {
  schema_version: 1,
  extractor_version: "1.0.0",
  consumer_hmac: hmac,
  session_hmac: hmac,
  started_at: "2026-07-15T00:00:00.000Z",
  ended_at: "2026-07-15T00:00:01.000Z",
  first_sequence: 1,
  last_sequence: 1,
  completeness: "complete",
  correlation_source: "time_window",
  sampling_probability: 0.1,
  low_volume_boosted: false,
  exchanges: [
    {
      sequence: 1,
      operation_key: "GET /orders",
      request_method: "GET",
      request_path: "/orders",
      response_status: 200,
    },
  ],
  extraction: {
    schema_version: 1,
    extractor_version: "1.0.0",
    fingerprints: [],
    echoes: [],
  },
};

describe("processed capture envelope", () => {
  it("accepts a strict redacted session", () => {
    expect(processedCaptureSessionSchema.safeParse(session).success).toBe(true);
  });

  it("rejects forbidden headers even when an agent attempts to send them", () => {
    expect(
      processedCaptureSessionSchema.safeParse({
        ...session,
        exchanges: [{ ...session.exchanges[0], request_headers: { authorization: ["secret"] } }],
      }).success,
    ).toBe(false);
  });

  it("rejects T1 echo evidence from an incomplete sequence", () => {
    expect(
      processedCaptureSessionSchema.safeParse({
        ...session,
        completeness: "partial",
        extraction: {
          ...session.extraction,
          echoes: [
            {
              source_sequence: 1,
              destination_sequence: 2,
              source_path: "$response/cursor",
              destination_path: "$request/query/cursor",
              value_token: hmac,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
