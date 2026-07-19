import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.HYRUM_E2E_CONTROL_PLANE_PORT ?? 4317);
const ids = {
  org: "10000000-0000-4000-8000-000000000001",
  policy: "80000000-0000-4000-8000-000000000001",
  run: "70000000-0000-4000-8000-000000000001",
};
const ledger = [
  row(1, "T1", "shape", "Echoed idempotency key", "POST /v1/orders", "Checkout Web", "6", 24, 1),
  row(
    2,
    "T2",
    "error",
    "Validation error template branch",
    "POST /v1/orders",
    "Mobile App",
    "7",
    11,
    3,
  ),
  row(3, "T3", "shape", "Legacy field exposure", "GET /v1/products", "Partner API", "8", 9, 2),
];
const consumers = [
  consumer(1, "checkout-web", "Checkout Web"),
  consumer(2, "mobile-app", "Mobile App"),
  consumer(3, "partner-api", "Partner API"),
];
let assertions = [];
let corpora = [];
let policy = {
  id: ids.policy,
  version: 1,
  block_tiers: ["T1"],
  warn_tiers: ["T2"],
  active: true,
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "PUT, POST, GET, PATCH, OPTIONS",
      "access-control-allow-headers": "content-type, x-amz-meta-sha256, x-amz-meta-kind",
    });
    return response.end();
  }
  const body = await readBody(request);
  if (url.pathname === "/health")
    return send(response, {
      service: "control-plane",
      status: "ok",
      version: "e2e",
      timestamp: new Date().toISOString(),
    });
  if (url.pathname === "/v1/session")
    return send(response, {
      actorId: "20000000-0000-4000-8000-000000000001",
      organizationId: ids.org,
      role: "admin",
    });
  if (url.pathname === "/v1/workspace/summary")
    return send(response, {
      organization: {
        id: ids.org,
        name: "Acme Corp",
        region: "us-east",
        retention_days: 30,
      },
      capture: {
        endpoint_count: 2,
        consumer_count: 3,
        sessions_24h: 6,
        evidence_events_24h: 44,
      },
    });
  if (url.pathname === "/v1/progress") return send(response, { events: [] });
  if (url.pathname === "/v1/consumers")
    return send(response, {
      consumers,
      total: consumers.length,
      next_cursor: null,
    });
  if (url.pathname === "/v1/ledger") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const tier = url.searchParams.get("tier");
    const kind = url.searchParams.get("kind");
    const state = url.searchParams.get("state");
    const filtered = ledger.filter(
      (item) =>
        (!q || JSON.stringify(item).toLowerCase().includes(q)) &&
        (!tier || item.tier === tier) &&
        (!kind || item.kind === kind) &&
        (!state || item.state === state),
    );
    return send(response, {
      entries: filtered,
      total: filtered.length,
      next_cursor: null,
    });
  }
  if (url.pathname.startsWith("/v1/receipts/")) {
    const entry = ledger.find((item) => item.receipt_id === url.pathname.split("/").at(-1));
    if (!entry)
      return send(
        response,
        {
          title: "Not found",
          status: 404,
          error: "Not found",
          code: "not_found",
        },
        404,
      );
    return send(response, receipt(entry));
  }
  if (url.pathname === "/v1/assertions" && request.method === "GET")
    return send(response, { assertions });
  if (url.pathname === "/v1/assertions" && request.method === "POST") {
    const assertion = {
      id: randomUUID(),
      behavior_id: body.behavior_id,
      claim_id: body.claim_id ?? null,
      owner_id: "20000000-0000-4000-8000-000000000001",
      reason: body.reason,
      status: "active",
      expires_at: body.expires_at,
      resolution_type: null,
      resolution_reason: null,
      resolved_by: null,
      resolved_at: null,
      customer_notice: null,
    };
    assertions = [assertion, ...assertions];
    return send(response, assertion, 201);
  }
  if (
    /^\/v1\/assertions\/[0-9a-f-]+\/spec-draft$/.test(url.pathname) &&
    request.method === "POST"
  ) {
    return send(response, {
      source: "model",
      response_id: "resp_e2e",
      model: "gpt-5.6",
      prompt_version: "spec-draft-v1",
      draft: {
        title: "Document echoed idempotency key",
        summary: "Adds the observed response contract.",
        rationale: "Receipt-bound evidence confirms use.",
        receiptIds: [ledger[0].receipt_id],
        uncertainty: 0.1,
        abstained: false,
        abstentionReason: null,
        openapiPatch: [
          {
            op: "add",
            path: "/paths/~1v1~1orders/post/responses/200/content/application~1json/schema/properties/idempotency_key",
            value: {
              type: "string",
              description: "Observed echoed key",
              format: null,
            },
          },
        ],
      },
    });
  }
  if (/^\/v1\/assertions\/[0-9a-f-]+\/resolve$/.test(url.pathname) && request.method === "POST") {
    const id = url.pathname.split("/")[3];
    const current = assertions.find((item) => item.id === id);
    if (!current)
      return send(
        response,
        {
          title: "Not found",
          status: 404,
          error: "Not found",
          code: "not_found",
        },
        404,
      );
    Object.assign(current, {
      status: body.resolution === "extend" ? "active" : "resolved",
      resolution_type:
        body.resolution === "schedule_break"
          ? "scheduled_break"
          : body.resolution === "extend"
            ? "extended"
            : "documented",
      resolution_reason: body.reason,
      resolved_by: "20000000-0000-4000-8000-000000000001",
      resolved_at: new Date().toISOString(),
      expires_at: body.expires_at ?? current.expires_at,
    });
    return send(response, current);
  }
  if (/^\/v1\/claims\/[0-9a-f-]+\/override$/.test(url.pathname) && request.method === "PUT") {
    const claimId = url.pathname.split("/")[3];
    const entry = ledger.find((item) => item.claim_id === claimId);
    if (!entry)
      return send(
        response,
        {
          title: "Not found",
          status: 404,
          error: "Not found",
          code: "not_found",
        },
        404,
      );
    if (body.tier) entry.tier = body.tier;
    return send(response, {
      claim_id: claimId,
      human_override_tier: body.tier,
      effective_tier: entry.tier,
      override_reason: body.reason,
      overridden_by: "20000000-0000-4000-8000-000000000001",
      overridden_at: new Date().toISOString(),
    });
  }
  if (url.pathname === "/v1/model-assistance/behavior_clusters" && request.method === "POST") {
    return send(response, {
      role: "behavior_clusters",
      run_id: randomUUID(),
      model: "gpt-5.6",
      prompt_version: "behavior-clusters-v1",
      result: {
        summary: "Receipt-backed behaviors form one compatibility cluster.",
        receiptIds: [ledger[0].receipt_id],
        uncertainty: 0.1,
        abstained: false,
        abstentionReason: null,
        clusters: [
          {
            name: "Echoed request correlation",
            description: "Consumers echo an observed response value in a later request.",
            behaviorIds: [ledger[0].behavior_id],
          },
        ],
      },
    });
  }
  if (url.pathname === "/v1/policy" && request.method === "GET") return send(response, policy);
  if (url.pathname === "/v1/policy" && request.method === "PUT") {
    policy = {
      ...policy,
      version: policy.version + 1,
      block_tiers: body.block_tiers,
      warn_tiers: body.warn_tiers,
    };
    return send(response, policy);
  }
  if (url.pathname === "/v1/replay/corpora" && request.method === "GET")
    return send(response, { corpora });
  if (url.pathname === "/v1/replay/corpora/uploads" && request.method === "POST") {
    const hash = body.sha256.slice("sha256:".length);
    return send(
      response,
      {
        object_key: `organizations/${ids.org}/corpus/sha256/${hash}`,
        upload_url: `http://127.0.0.1:${port}/fixture-upload/${hash}`,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        headers: {
          "content-type": body.content_type,
          "x-amz-meta-sha256": hash,
          "x-amz-meta-kind": "corpus",
        },
      },
      201,
    );
  }
  if (url.pathname.startsWith("/fixture-upload/") && request.method === "PUT") {
    return send(response, { uploaded: Buffer.isBuffer(body) });
  }
  if (url.pathname === "/v1/replay/corpora" && request.method === "POST") {
    const corpus = {
      id: randomUUID(),
      version: body.version,
      digest: body.digest,
      object_key: body.object_key,
      fixture_digest: body.fixture_digest ?? null,
      fixture_object_key: body.fixture_object_key ?? null,
      stubs_object_key: body.stubs_object_key ?? null,
      curation_status: "draft",
      created_by: "20000000-0000-4000-8000-000000000001",
      items: [],
    };
    corpora = [corpus, ...corpora];
    return send(response, corpus, 201);
  }
  if (
    /^\/v1\/replay\/corpora\/[0-9a-f-]+\/items$/.test(url.pathname) &&
    request.method === "POST"
  ) {
    const corpus = corpora.find((item) => item.id === url.pathname.split("/")[4]);
    if (!corpus) return send(response, { title: "Not found", status: 404 }, 404);
    const item = { id: randomUUID(), corpus_id: corpus.id, ...body };
    corpus.items.push(item);
    return send(response, item, 201);
  }
  if (/^\/v1\/replay\/corpora\/[0-9a-f-]+$/.test(url.pathname) && request.method === "PATCH") {
    const corpus = corpora.find((item) => item.id === url.pathname.split("/")[4]);
    if (!corpus) return send(response, { title: "Not found", status: 404 }, 404);
    corpus.curation_status = body.curation_status;
    return send(response, corpus);
  }
  if (url.pathname === "/v1/replay/runs/latest") return send(response, replayRun());
  return send(
    response,
    { title: "Not found", status: 404, error: "Not found", code: "not_found" },
    404,
  );
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`e2e control plane on ${port}\n`));

function row(index, tier, kind, title, endpoint, alias, digestDigit, observations, sessions) {
  const n = String(index).padStart(12, "0");
  return {
    id: `90000000-0000-4000-8000-${n}`,
    claim_id: `91000000-0000-4000-8000-${n}`,
    behavior_id: `92000000-0000-4000-8000-${n}`,
    consumer_id: `93000000-0000-4000-8000-${n}`,
    operation_id: `94000000-0000-4000-8000-${n}`,
    kind,
    tier,
    state: "active",
    title,
    last_seen_at: "2026-07-18T08:00:00.000Z",
    freshness_until: "2026-10-18T08:00:00.000Z",
    receipt_id: `95000000-0000-4000-8000-${n}`,
    endpoint,
    consumer_alias: alias,
    consumer_stable_id: alias.toLowerCase().replaceAll(" ", "-"),
    observation_count: observations,
    session_count: sessions,
    owner: "Platform API",
    receipt_digest: `sha256:${digestDigit.repeat(64)}`,
  };
}
function consumer(index, stable, alias) {
  const n = String(index).padStart(12, "0");
  return {
    id: `93000000-0000-4000-8000-${n}`,
    stable_id: stable,
    display_alias: alias,
    last_seen_at: "2026-07-18T08:00:00.000Z",
  };
}
function receipt(entry) {
  return {
    id: entry.receipt_id,
    behavior_id: entry.behavior_id,
    consumer_id: entry.consumer_id,
    operation_id: entry.operation_id,
    object_key: "receipts/e2e.json",
    digest: entry.receipt_digest,
    redaction_version: "1.0.0",
    sequence_start: 1,
    sequence_end: 2,
    excerpt: { response_hash: "hash_redacted", request_hash: "hash_redacted" },
    expires_at: "2026-10-18T08:00:00.000Z",
  };
}
function replayRun() {
  return {
    id: ids.run,
    generated_at: "2026-07-18T08:05:00.000Z",
    base_url: "https://base.hyrum.test",
    candidate_url: "https://candidate.hyrum.test",
    base_image_digest: `sha256:${"a".repeat(64)}`,
    candidate_image_digest: `sha256:${"b".repeat(64)}`,
    extractor_version: "1.1.0",
    corpus_digest: `sha256:${"c".repeat(64)}`,
    fixture_digest: `sha256:${"d".repeat(64)}`,
    mask_digest: `sha256:${"e".repeat(64)}`,
    runner_version: "1.0.0",
    policy_id: ids.policy,
    policy_version: 1,
    runs: 3,
    outcome: "block",
    decision: {
      outcome: "block",
      block_count: 1,
      warn_count: 1,
      note_count: 1,
      reasons: ["A matched T1 behavior changed."],
    },
    deltas: [
      {
        case_id: "order-create",
        kind: "shape",
        path: "$.response.idempotency_key",
        digest: `sha256:${"f".repeat(64)}`,
        stable: true,
        quarantined: false,
        before: { present: true },
        after: { present: false },
        matches: [{ claim_id: ledger[0].claim_id }],
      },
      {
        case_id: "order-validation",
        kind: "error",
        path: "$.response.error.template",
        digest: `sha256:${"1".repeat(64)}`,
        stable: true,
        quarantined: false,
        before: "template-a",
        after: "template-b",
        matches: [{ claim_id: ledger[1].claim_id }],
      },
    ],
    assertion_results: [],
  };
}
async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const body = Buffer.concat(chunks);
  return request.headers["content-type"]?.includes("application/json")
    ? JSON.parse(body.toString("utf8"))
    : body;
}
function send(response, value, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(value));
}
