import { type AgentCaptureEvent, progressEventTopic } from "@hyrum/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  deriveBehaviorCandidates,
  enqueueCaptureFollowup,
  ensureEventTenant,
  ledgerTitle,
  storeReceiptBundle,
  undeclaredBehaviorCandidates,
} from "./ingestion";
import { normalizeOpenApiSpec } from "./openapi";

const organizationId = "00000000-0000-4000-8000-000000000001";
const stringToken = `hmac-sha256:string:${"a".repeat(64)}`;
const otherStringToken = `hmac-sha256:string:${"b".repeat(64)}`;

const event = {
  organization_id: organizationId,
  event_id: "evt_1",
  session_id: "session_1",
  consumer_id: "consumer_1",
  version: "1.0.0",
  redaction_version: "2.0.0",
  sequence: 2,
  session_complete: true,
  occurred_at: new Date().toISOString(),
  request: { method: "GET", path: `/${stringToken}`, path_template: "/products" },
  response: { status: 200 },
  fingerprint: {
    version: "1.1.0",
    status: 200,
    shape: [
      { path: "$.id", type: "string" },
      { path: "$.next_cursor", type: "string" },
      { path: "$.legacy_id", type: "string" },
    ],
    presence: [
      { path: "$.id", states: ["present"] },
      { path: "$.next_cursor", states: ["null", "present"] },
      { path: "$.legacy_id", states: ["absent", "present"] },
    ],
    enums: [
      {
        path: "$.legacy_id",
        values: ["c".repeat(64), "d".repeat(64)],
      },
    ],
    error: { status: 422, template: otherStringToken, digest: "err_422" },
  },
  evidence: [
    {
      tier: "T3",
      exposure: { behavior_kind: "shape", behavior_path: "$.id", count: 50 },
    },
    {
      tier: "T1",
      echo: {
        token_hash: stringToken,
        response_event_id: "evt_1",
        request_event_id: "evt_2",
        response_sequence: 2,
        request_sequence: 3,
        request_method: "GET",
        request_path: `/${stringToken}`,
        response_paths: ["$.next_cursor"],
        request_paths: ["$.cursor"],
      },
    },
    {
      tier: "T2",
      pattern: {
        status: 422,
        error_template: otherStringToken,
        next_request: `POST /${stringToken}/${otherStringToken}`,
        support: 12,
        confounder_notes: [],
      },
    },
    {
      tier: "T3",
      exposure: { behavior_kind: "shape", behavior_path: "$.legacy_id", count: 50 },
    },
  ],
} satisfies AgentCaptureEvent;

const spec = normalizeOpenApiSpec({
  openapi: "3.1.0",
  paths: {
    "/products": {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id"],
                  properties: { id: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  },
});

describe("capture tenant boundary", () => {
  it("rejects events whose organization_id differs from the credential tenant", () => {
    expect(ensureEventTenant(event.organization_id, event)).toBe(true);
    expect(ensureEventTenant("00000000-0000-4000-8000-000000000002", event)).toBe(false);
  });
});

describe("capture evidence candidates", () => {
  it("keeps strongest evidence by behavior and does not call T3 a dependency", () => {
    const candidates = deriveBehaviorCandidates(event);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "shape", path: "$.next_cursor", tier: "T1" }),
        expect.objectContaining({ kind: "error", path: "$error", tier: "T2" }),
        expect.objectContaining({ kind: "shape", path: "$.legacy_id", tier: "T3" }),
      ]),
    );
    const legacy = candidates.find((candidate) => candidate.path === "$.legacy_id");
    expect(legacy?.tier).toBe("T3");
    expect(legacy?.fingerprint).toEqual({
      path: "$.legacy_id",
      type: "string",
      presence: ["absent", "present"],
      observed_enum: ["c".repeat(64), "d".repeat(64)],
      enum_truncated: false,
    });
    expect(legacy ? ledgerTitle(legacy) : "").toBe("Exposure: shape $.legacy_id");
  });

  it("subtracts declared id while keeping next_cursor T1, error T2, and legacy_id T3", () => {
    const candidates = undeclaredBehaviorCandidates(event, spec);
    expect(
      candidates.map((candidate) => `${candidate.tier}:${candidate.kind}:${candidate.path}`),
    ).toEqual(["T1:shape:$.next_cursor", "T2:error:$error", "T3:shape:$.legacy_id"]);
  });
});

describe("receipt object storage", () => {
  it("stores the canonical redacted bundle under its content digest", async () => {
    const putObject = vi.fn(async (input) => ({
      key: "organizations/org/receipt/digest",
      ...input,
    }));
    const excerpt = { evidence: [{ tier: "T1" }], request: { path: "/products" } };

    const stored = await storeReceiptBundle({
      objectStorage: { putObject } as never,
      organizationId,
      excerpt,
    });

    expect(stored?.key).toBe("organizations/org/receipt/digest");
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        kind: "receipt",
        contentType: "application/json",
        expectedSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("keeps receipt metadata available when object storage fails", async () => {
    const failure = new Error("storage unavailable");
    const onError = vi.fn();
    const stored = await storeReceiptBundle({
      objectStorage: { putObject: vi.fn(async () => Promise.reject(failure)) } as never,
      organizationId,
      excerpt: { redacted: true },
      onError,
    });

    expect(stored).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(failure);
  });
});

describe("capture follow-up events", () => {
  function fakeDb() {
    const rows: unknown[] = [];
    let id = 0;
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          rows.push(value);
          const chain = {
            onConflictDoNothing: vi.fn(() => chain),
            returning: vi.fn(async () => [
              { id: `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` },
            ]),
          };
          return chain;
        }),
      })),
    };
    return { rows, tx };
  }

  it("emits capture and ledger topics when accepted events may update the ledger", async () => {
    const { tx, rows } = fakeDb();

    await enqueueCaptureFollowup(tx as never, organizationId, "batch_1", "agent_1:batch_1", {
      batch_id: "batch_1",
      accepted_count: 1,
      rejected_count: 0,
      results: [{ event_id: "evt_1", status: "accepted" }],
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: progressEventTopic.captureBatchIngested }),
        expect.objectContaining({ topic: progressEventTopic.ledgerUpdated }),
      ]),
    );
  });

  it("does not emit a ledger update for fully rejected batches", async () => {
    const { tx, rows } = fakeDb();

    await enqueueCaptureFollowup(tx as never, organizationId, "batch_1", "agent_1:batch_1", {
      batch_id: "batch_1",
      accepted_count: 0,
      rejected_count: 1,
      results: [{ event_id: "evt_1", status: "rejected", code: "bad", error: "bad event" }],
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: progressEventTopic.captureBatchIngested }),
      ]),
    );
    expect(rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: progressEventTopic.ledgerUpdated }),
      ]),
    );
  });
});
