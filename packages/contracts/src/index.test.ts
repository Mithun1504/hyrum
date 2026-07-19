import { describe, expect, it } from "vitest";
import {
  agentCaptureEventSchema,
  healthResponseSchema,
  replayReportSchema,
  roleHasPermission,
  upsertGatePolicyRequestSchema,
} from "./index";

describe("healthResponseSchema", () => {
  it("accepts a valid service health response", () => {
    const value = healthResponseSchema.parse({
      service: "control-plane",
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    });
    expect(value.status).toBe("ok");
  });
});

describe("role permissions", () => {
  it("keeps viewers read-only and policy changes admin-only", () => {
    expect(roleHasPermission("viewer", "ledger:read")).toBe(true);
    expect(roleHasPermission("viewer", "assertion:pin")).toBe(false);
    expect(roleHasPermission("engineer", "assertion:pin")).toBe(true);
    expect(roleHasPermission("engineer", "policy:manage")).toBe(false);
    expect(roleHasPermission("admin", "policy:manage")).toBe(true);
  });
});

describe("gate policy contracts", () => {
  it("allows only T1 in block_tiers", () => {
    expect(
      upsertGatePolicyRequestSchema.parse({ block_tiers: ["T1"], warn_tiers: ["T2"] }),
    ).toMatchObject({ block_tiers: ["T1"] });
    expect(() =>
      upsertGatePolicyRequestSchema.parse({ block_tiers: ["T2"], warn_tiers: [] }),
    ).toThrow();
    expect(() =>
      upsertGatePolicyRequestSchema.parse({ block_tiers: ["T1"], warn_tiers: ["T1"] }),
    ).toThrow(/cannot both block and warn/);
  });
});

describe("capture contracts", () => {
  const stringToken = `hmac-sha256:string:${"a".repeat(64)}`;
  const otherStringToken = `hmac-sha256:string:${"b".repeat(64)}`;
  const numberToken = `hmac-sha256:number:${"c".repeat(64)}`;

  it("uses one-based sequences and the Go agent output shape", () => {
    const base = {
      organization_id: "00000000-0000-4000-8000-000000000001",
      event_id: "evt_1",
      session_id: "session_1",
      consumer_id: "consumer_1",
      version: "1.0.0",
      redaction_version: "2.0.0",
      session_complete: true,
      occurred_at: new Date().toISOString(),
      request: { method: "GET", path: `/${stringToken}` },
      response: { status: 200 },
      fingerprint: { version: "1.0.0", status: 200, shape: [] },
      evidence: [],
    };
    expect(() => agentCaptureEventSchema.parse({ ...base, sequence: 0 })).toThrow();
    expect(agentCaptureEventSchema.parse({ ...base, sequence: 1 }).sequence).toBe(1);
    expect(() =>
      agentCaptureEventSchema.parse({ ...base, sequence: 1, version: "1.0.1" }),
    ).toThrow();
  });

  it("accepts only typed structural scalars, null, and redaction markers", () => {
    const base = {
      organization_id: "00000000-0000-4000-8000-000000000001",
      event_id: "evt_1",
      session_id: "session_1",
      consumer_id: "consumer_1",
      version: "1.0.0",
      redaction_version: "2.0.0",
      sequence: 1,
      session_complete: true,
      occurred_at: new Date().toISOString(),
      request: {
        method: "POST",
        path: `/${stringToken}`,
        path_template: "/products/{id}",
        body: {
          nested: [{ authorization: "[REDACTED]", count: numberToken, optional: null }],
        },
      },
      response: {
        status: 200,
        body: { contact: stringToken, download: otherStringToken },
      },
      fingerprint: { version: "1.0.0", status: 200, shape: [] },
      evidence: [],
    };

    expect(agentCaptureEventSchema.parse(base).request.body).toBeDefined();
    expect(() =>
      agentCaptureEventSchema.parse({
        ...base,
        response: { status: 200, body: { nested: [{ password: "plain-text-secret" }] } },
      }),
    ).toThrow(/must be redacted/);
    expect(() =>
      agentCaptureEventSchema.parse({
        ...base,
        response: { status: 200, body: { nested: ["person@example.com"] } },
      }),
    ).toThrow(/exact v2 structural token/);
    expect(() =>
      agentCaptureEventSchema.parse({
        ...base,
        response: { status: 200, body: { count: 42 } },
      }),
    ).toThrow(/unsupported unredacted scalar/);
    expect(() =>
      agentCaptureEventSchema.parse({
        ...base,
        request: { ...base.request, path: "/products" },
      }),
    ).toThrow(/path must contain only/);
    expect(() =>
      agentCaptureEventSchema.parse({
        ...base,
        request: { ...base.request, path_template: "/products/{bad param}" },
      }),
    ).toThrow(/safe configured operation template/);
    expect(() =>
      agentCaptureEventSchema.parse({
        ...base,
        request: { ...base.request, headers: { "X-Trace": "raw-canary" } },
      }),
    ).toThrow(/value must be dropped/);
  });

  it("binds T1 evidence to an originating response and a later sanitized request", () => {
    const event = {
      organization_id: "00000000-0000-4000-8000-000000000001",
      event_id: "response-event",
      session_id: "session_1",
      consumer_id: "consumer_1",
      version: "1.0.0",
      redaction_version: "2.0.0",
      sequence: 2,
      session_complete: true,
      occurred_at: new Date().toISOString(),
      request: { method: "GET", path: `/${stringToken}` },
      response: { status: 200 },
      fingerprint: { version: "1.0.0", status: 200, shape: [] },
      evidence: [
        {
          tier: "T1",
          echo: {
            token_hash: stringToken,
            response_event_id: "response-event",
            request_event_id: "request-event",
            response_sequence: 2,
            request_sequence: 3,
            request_method: "GET",
            request_path: `/${stringToken}/${otherStringToken}`,
            response_paths: ["$.next_cursor"],
            request_paths: ["$.cursor"],
          },
        },
      ],
    };

    expect(agentCaptureEventSchema.parse(event).evidence).toHaveLength(1);
    expect(() =>
      agentCaptureEventSchema.parse({
        ...event,
        evidence: [
          {
            ...event.evidence[0],
            echo: { ...event.evidence[0]?.echo, request_sequence: 2 },
          },
        ],
      }),
    ).toThrow(/must follow/);
  });
});

describe("replay report contracts", () => {
  it("accepts status deltas and strict snake_case report fields", () => {
    const report = replayReportSchema.parse({
      version: "1",
      organization_id: "00000000-0000-4000-8000-000000000001",
      generated_at: new Date().toISOString(),
      base_url: "https://base.example.test",
      candidate_url: "https://candidate.example.test",
      base_image_digest: `sha256:${"a".repeat(64)}`,
      candidate_image_digest: `sha256:${"b".repeat(64)}`,
      extractor_version: "extractor-1",
      corpus_digest: `sha256:${"c".repeat(64)}`,
      fixture_digest: `sha256:${"d".repeat(64)}`,
      mask_digest: `sha256:${"e".repeat(64)}`,
      runner_version: "runner-1",
      policy_id: "00000000-0000-4000-8000-000000000091",
      policy_version: 1,
      runs: 2,
      results: [
        {
          case_id: "case_1",
          stable: true,
          quarantined: false,
          deltas: [{ kind: "status", path: "$.status", digest: "sha256:def", matches: [] }],
        },
      ],
      assertion_results: [],
      source: {
        github: {
          repository_owner: "hyrum",
          repository_name: "demo",
          head_sha: "abcdef1",
          pull_request: 42,
          installation_id: 91,
        },
        slack: { channel: "C12345678" },
      },
      signature: { algorithm: "ed25519", key_id: "agent_1", value: "sig" },
    });
    expect(report.results[0]?.deltas[0]?.kind).toBe("status");
    expect(report.source?.github?.pull_request).toBe(42);
  });

  it("requires distinct immutable image digests", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const base = {
      version: "1",
      organization_id: "00000000-0000-4000-8000-000000000001",
      generated_at: new Date().toISOString(),
      base_url: "https://base.example.test",
      candidate_url: "https://candidate.example.test",
      base_image_digest: digest,
      candidate_image_digest: digest,
      extractor_version: "extractor-1",
      corpus_digest: `sha256:${"c".repeat(64)}`,
      fixture_digest: `sha256:${"d".repeat(64)}`,
      mask_digest: `sha256:${"e".repeat(64)}`,
      runner_version: "runner-1",
      policy_id: "00000000-0000-4000-8000-000000000091",
      policy_version: 1,
      runs: 1,
      results: [],
      assertion_results: [],
      signature: { algorithm: "ed25519", key_id: "agent_1", value: "sig" },
    };
    expect(() => replayReportSchema.parse(base)).toThrow(/must differ/);
    expect(() =>
      replayReportSchema.parse({
        ...base,
        candidate_image_digest: `sha256:${"b".repeat(64)}`,
        base_image_digest: `sha256:${"A".repeat(64)}`,
      }),
    ).toThrow();
  });

  it("requires strict signed assertion coverage entries", () => {
    const result = {
      assertion_id: "00000000-0000-4000-8000-000000000010",
      behavior_id: "00000000-0000-4000-8000-000000000020",
      claim_id: null,
      case_id: "case_1",
      outcome: "pass",
    } as const;

    const parsed = replayReportSchema.parse({
      version: "1",
      organization_id: "00000000-0000-4000-8000-000000000001",
      generated_at: new Date().toISOString(),
      base_url: "https://base.example.test",
      candidate_url: "https://candidate.example.test",
      base_image_digest: `sha256:${"a".repeat(64)}`,
      candidate_image_digest: `sha256:${"b".repeat(64)}`,
      extractor_version: "extractor-1",
      corpus_digest: `sha256:${"c".repeat(64)}`,
      fixture_digest: `sha256:${"d".repeat(64)}`,
      mask_digest: `sha256:${"e".repeat(64)}`,
      runner_version: "runner-1",
      policy_id: "00000000-0000-4000-8000-000000000091",
      policy_version: 1,
      runs: 1,
      results: [],
      assertion_results: [result],
      signature: { algorithm: "ed25519", key_id: "agent_1", value: "sig" },
    });
    expect(parsed.assertion_results).toEqual([result]);
  });
});
