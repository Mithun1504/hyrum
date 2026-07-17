import { progressEventTopic } from "@hyrum/api-client";
import type {
  Assertion,
  Consumer,
  GatePolicy,
  LedgerRow,
  ProgressEvent,
  Receipt,
  ReplayReport,
} from "@/services/workspace-data";

const now = "2026-07-15T08:00:00.000Z";
const demoOrganizationId = "77777777-7777-4777-8777-777777777777";

export const in90Days = "2026-10-13T08:00:00.000Z";

export const consumers: Consumer[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    stable_id: "consumer_a_checkout",
    display_alias: "Checkout importer",
    last_seen_at: "2026-07-15T07:42:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    stable_id: "consumer_b_support",
    display_alias: "Support sync",
    last_seen_at: "2026-07-15T07:20:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    stable_id: "consumer_c_warehouse",
    display_alias: "Warehouse export",
    last_seen_at: "2026-07-14T23:14:00.000Z",
  },
];

export const ledgerRows: LedgerRow[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    claim_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    behavior_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    consumer_id: consumers[0].id,
    operation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    kind: "shape",
    tier: "T1",
    state: "active",
    title: "Undeclared response field `next_cursor` is echoed into the next request.",
    last_seen_at: "2026-07-15T07:42:00.000Z",
    freshness_until: "2026-10-13T07:42:00.000Z",
    receipt_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    endpoint: "GET /v1/orders",
    consumer_alias: consumers[0].display_alias,
    consumer_stable_id: consumers[0].stable_id,
    impact: "Blocks candidate rename to `cursor` because the follow-up request proves reliance.",
    evidence_summary:
      "Response offset 184 emits a keyed cursor hash; request offset 185 sends the same hash.",
    owner: "Platform API",
    receipt_digest: "sha256:3b78...c91f",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
    claim_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbba",
    behavior_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccca",
    consumer_id: consumers[1].id,
    operation_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddda",
    kind: "error",
    tier: "T2",
    state: "active",
    title: "422 template text changes retry branch selection.",
    last_seen_at: "2026-07-15T07:20:00.000Z",
    freshness_until: "2026-10-13T07:20:00.000Z",
    receipt_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea",
    endpoint: "POST /v1/orders",
    consumer_alias: consumers[1].display_alias,
    consumer_stable_id: consumers[1].stable_id,
    impact: "Warns only. The pattern is suggestive, not a blocking proof.",
    evidence_summary: "Retries diverge after the message template, while status remains 422.",
    owner: "DX",
    receipt_digest: "sha256:65ca...91a0",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac",
    claim_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
    behavior_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccb",
    consumer_id: consumers[2].id,
    operation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddb",
    kind: "shape",
    tier: "T3",
    state: "active",
    title: "Undeclared `legacy_id` field is visible at volume.",
    last_seen_at: "2026-07-14T23:14:00.000Z",
    freshness_until: "2026-10-12T23:14:00.000Z",
    receipt_id: null,
    endpoint: "GET /v1/products/{id}",
    consumer_alias: consumers[2].display_alias,
    consumer_stable_id: consumers[2].stable_id,
    impact: "Exposure only. It is not labeled as a dependency and never blocks.",
    evidence_summary: "7,420 receipts include the field, with no echo or branching signal.",
    owner: "Catalog",
    receipt_digest: null,
  },
];

export const receipts: Receipt[] = [
  {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    behavior_id: ledgerRows[0].behavior_id,
    consumer_id: ledgerRows[0].consumer_id,
    operation_id: ledgerRows[0].operation_id,
    object_key: "org/demo/receipts/t1-next-cursor.json",
    digest: "sha256:3b78f02f0f78c91f",
    redaction_version: "redactor-0.3.0",
    sequence_start: 184,
    sequence_end: 185,
    excerpt: {
      response: {
        status: 200,
        body: { data: "[12 orders]", next_cursor: "hmac:v1:8d5f...991c" },
      },
      later_request: { query: { cursor: "hmac:v1:8d5f...991c" } },
      proof: "same keyed hash appears response->request inside complete session",
    },
    expires_at: "2026-08-14T07:42:00.000Z",
  },
  {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea",
    behavior_id: ledgerRows[1].behavior_id,
    consumer_id: ledgerRows[1].consumer_id,
    operation_id: ledgerRows[1].operation_id,
    object_key: "org/demo/receipts/t2-422-template.json",
    digest: "sha256:65cad5e910c891a0",
    redaction_version: "redactor-0.3.0",
    sequence_start: 301,
    sequence_end: 306,
    excerpt: {
      response: { status: 422, body: { error: "SKU is no longer available" } },
      observed_branch: "consumer retries lookup path before resubmitting",
      proof: "pattern evidence; status-only explanation rejected by replay comparison",
    },
    expires_at: "2026-08-14T07:20:00.000Z",
  },
];

export const assertions: Assertion[] = [
  {
    id: "99999999-9999-4999-8999-999999999999",
    behavior_id: ledgerRows[1].behavior_id,
    claim_id: ledgerRows[1].claim_id,
    owner_id: "platform-api",
    reason: "Keep support importer stable while the public error schema lands.",
    status: "active",
    expires_at: in90Days,
  },
  {
    id: "99999999-9999-4999-8999-999999999998",
    behavior_id: ledgerRows[2].behavior_id,
    claim_id: null,
    owner_id: "catalog",
    reason: "Keep the warehouse export stable until legacy_id is documented or removed.",
    status: "active",
    expires_at: in90Days,
  },
];

export const gatePolicy: GatePolicy = {
  id: "88888888-8888-4888-8888-888888888888",
  version: 3,
  block_tiers: ["T1"],
  warn_tiers: ["T2"],
  active: true,
};

export const replayReport: ReplayReport = {
  generated_at: now,
  base_url: "https://ci.example.test/base",
  candidate_url: "https://ci.example.test/candidate",
  base_image_digest: `sha256:${"a".repeat(64)}`,
  candidate_image_digest: `sha256:${"b".repeat(64)}`,
  extractor_version: "extractors-go-0.4.1",
  corpus_digest: "sha256:fixture-50k",
  runs: 3,
  results: [
    {
      case_id: "orders-pagination-cursor",
      stable: true,
      quarantined: false,
      deltas: [
        {
          kind: "shape",
          path: "$.next_cursor",
          before: "present",
          after: "absent",
          digest: "sha256:delta-next-cursor",
          matches: [{ claim_id: ledgerRows[0].claim_id, tier: "T1" }],
        },
      ],
    },
    {
      case_id: "orders-validation-template",
      stable: true,
      quarantined: false,
      deltas: [
        {
          kind: "error",
          path: "$.error",
          before: "SKU is no longer available",
          after: "Item unavailable",
          digest: "sha256:delta-422-template",
          matches: [{ claim_id: ledgerRows[1].claim_id, tier: "T2" }],
        },
      ],
    },
  ],
  decision: {
    outcome: "block",
    block_count: 1,
    warn_count: 1,
    note_count: 0,
    reasons: ["T1 echo evidence matched `next_cursor` rename", "T2 error-template pattern warns"],
  },
  assertion_results: [
    {
      assertion_id: assertions[0].id,
      behavior_id: assertions[0].behavior_id,
      claim_id: assertions[0].claim_id,
      case_id: "orders-validation-template",
      outcome: "fail",
    },
    {
      assertion_id: assertions[1].id,
      behavior_id: assertions[1].behavior_id,
      claim_id: null,
      case_id: "products-legacy-id-preserved",
      outcome: "pass",
    },
  ],
};

export const progressEvents: ProgressEvent[] = [
  {
    id: 1,
    organization_id: demoOrganizationId,
    topic: progressEventTopic.captureBatchIngested,
    resource_id: "fixture-50k",
    payload: { accepted: 50_000, rejected: 0 },
    created_at: "2026-07-15T07:02:00.000Z",
  },
  {
    id: 2,
    organization_id: demoOrganizationId,
    topic: progressEventTopic.ledgerUpdated,
    resource_id: ledgerRows[0].id,
    payload: { t1: 1, t2: 1, t3: 1 },
    created_at: "2026-07-15T07:18:00.000Z",
  },
  {
    id: 3,
    organization_id: demoOrganizationId,
    topic: progressEventTopic.replayReportIngested,
    resource_id: "candidate-pr-184",
    payload: { outcome: replayReport.decision.outcome, runs: replayReport.runs },
    created_at: now,
  },
];
