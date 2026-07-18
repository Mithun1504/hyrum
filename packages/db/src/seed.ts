import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  agents,
  apiSpecs,
  assertions,
  auditEvents,
  behaviorDefinitions,
  behaviorObservations,
  captureBatches,
  captureSessions,
  consumers,
  corpusItems,
  createDatabaseClient,
  dependencyClaims,
  gateDecisions,
  gatePolicies,
  githubRepositories,
  jobs,
  ledgerEntries,
  llmRuns,
  memberships,
  operations,
  organizations,
  outboxEvents,
  progressEvents,
  receipts,
  replayAssertionResults,
  replayCorpora,
  replayDeltas,
  replayRuns,
  slackChannels,
  users,
} from "./index";

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  user: "10000000-0000-4000-8000-000000000002",
  membership: "10000000-0000-4000-8000-000000000003",
  agent: "10000000-0000-4000-8000-000000000004",
  github: "10000000-0000-4000-8000-000000000005",
  slack: "10000000-0000-4000-8000-000000000006",
  spec: "20000000-0000-4000-8000-000000000001",
  policy: "20000000-0000-4000-8000-000000000002",
  corpus: "20000000-0000-4000-8000-000000000003",
  replay: "20000000-0000-4000-8000-000000000004",
  gate: "20000000-0000-4000-8000-000000000005",
  operation: [
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003",
    "30000000-0000-4000-8000-000000000004",
  ],
  consumer: [
    "40000000-0000-4000-8000-000000000001",
    "40000000-0000-4000-8000-000000000002",
    "40000000-0000-4000-8000-000000000003",
  ],
  session: [
    "50000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000002",
    "50000000-0000-4000-8000-000000000003",
  ],
  behavior: [
    "60000000-0000-4000-8000-000000000001",
    "60000000-0000-4000-8000-000000000002",
    "60000000-0000-4000-8000-000000000003",
    "60000000-0000-4000-8000-000000000004",
  ],
  receipt: [
    "70000000-0000-4000-8000-000000000001",
    "70000000-0000-4000-8000-000000000002",
    "70000000-0000-4000-8000-000000000003",
  ],
  claim: [
    "80000000-0000-4000-8000-000000000001",
    "80000000-0000-4000-8000-000000000002",
    "80000000-0000-4000-8000-000000000003",
    "80000000-0000-4000-8000-000000000004",
  ],
  ledger: [
    "90000000-0000-4000-8000-000000000001",
    "90000000-0000-4000-8000-000000000002",
    "90000000-0000-4000-8000-000000000003",
    "90000000-0000-4000-8000-000000000004",
  ],
  assertion: [
    "a0000000-0000-4000-8000-000000000001",
    "a0000000-0000-4000-8000-000000000002",
    "a0000000-0000-4000-8000-000000000003",
  ],
} as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed Hyrum");
if (process.env.NODE_ENV === "production" && process.env.HYRUM_ALLOW_PRODUCTION_SEED !== "1") {
  throw new Error("Production seeding is disabled; set HYRUM_ALLOW_PRODUCTION_SEED=1 explicitly");
}

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const daysFromNow = (days: number) => new Date(now.getTime() + days * 86_400_000);
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const seedAgentToken =
  process.env.HYRUM_SEED_AGENT_TOKEN ?? "hyrum_seedagent_seed-development-token-0001";
const signingPublicKey = process.env.HYRUM_SEED_SIGNING_PUBLIC_KEY;
function required<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Seed fixture index ${index} is out of range`);
  return value;
}
const database = createDatabaseClient(connectionString, 1, process.env.DATABASE_SSL === "true");

try {
  const result = await database.db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ids.organization))
      .limit(1);
    if (existing.length > 0) return "already-present" as const;

    await tx.insert(organizations).values({
      id: ids.organization,
      workosOrganizationId: process.env.HYRUM_SEED_WORKOS_ORGANIZATION_ID ?? "org_hyrum_seed",
      name: process.env.HYRUM_SEED_ORGANIZATION_NAME ?? "Hyrum Seed Workspace",
      region: "us-east-1",
      retentionDays: 90,
    });
    await tx.execute(sql`select set_config('app.organization_id', ${ids.organization}, true)`);

    await tx.insert(users).values({
      id: ids.user,
      workosUserId: process.env.HYRUM_SEED_WORKOS_USER_ID ?? "user_hyrum_seed",
      email: process.env.HYRUM_SEED_USER_EMAIL ?? "seed-owner@example.test",
      displayName: "Seed Owner",
    });
    await tx.insert(memberships).values({
      id: ids.membership,
      organizationId: ids.organization,
      userId: ids.user,
      role: "owner",
    });
    await tx.insert(agents).values({
      id: ids.agent,
      organizationId: ids.organization,
      name: "Seed capture and replay agent",
      tokenPrefix: "seedagent",
      tokenHash: `sha256:${createHash("sha256").update(seedAgentToken).digest("hex")}`,
      scopes: signingPublicKey ? ["capture:write", "replay:write"] : ["capture:write"],
      signingPublicKey,
      lastSeenAt: hoursAgo(1),
    });
    await tx.insert(githubRepositories).values({
      id: ids.github,
      organizationId: ids.organization,
      installationId: 84_270,
      owner: "hyrum-seed",
      name: "orders-api",
    });
    await tx.insert(slackChannels).values({
      id: ids.slack,
      organizationId: ids.organization,
      channelId: "CSEEDGATES",
    });

    await tx.insert(apiSpecs).values({
      id: ids.spec,
      organizationId: ids.organization,
      version: "2026-07-seed",
      objectKey: `${ids.organization}/api-specs/seed-openapi.json`,
      digest: digest("1"),
      normalized: { openapi: "3.1.0", info: { title: "Seed Orders API", version: "1.0.0" } },
      active: true,
      uploadedBy: ids.user,
    });
    await tx.insert(operations).values([
      {
        id: ids.operation[0],
        organizationId: ids.organization,
        apiSpecId: ids.spec,
        method: "POST",
        pathTemplate: "/v1/orders",
        operationId: "createOrder",
      },
      {
        id: ids.operation[1],
        organizationId: ids.organization,
        apiSpecId: ids.spec,
        method: "GET",
        pathTemplate: "/v1/orders/{id}",
        operationId: "getOrder",
      },
      {
        id: ids.operation[2],
        organizationId: ids.organization,
        apiSpecId: ids.spec,
        method: "PATCH",
        pathTemplate: "/v1/orders/{id}",
        operationId: "updateOrder",
      },
      {
        id: ids.operation[3],
        organizationId: ids.organization,
        apiSpecId: ids.spec,
        method: "DELETE",
        pathTemplate: "/v1/orders/{id}",
        operationId: "deleteOrder",
      },
    ]);
    await tx.insert(consumers).values([
      {
        id: ids.consumer[0],
        organizationId: ids.organization,
        stableId: "checkout-web",
        displayAlias: "Checkout Web",
        lastSeenAt: hoursAgo(1),
      },
      {
        id: ids.consumer[1],
        organizationId: ids.organization,
        stableId: "support-sync",
        displayAlias: "Support Sync",
        lastSeenAt: hoursAgo(2),
      },
      {
        id: ids.consumer[2],
        organizationId: ids.organization,
        stableId: "warehouse-worker",
        displayAlias: "Warehouse Worker",
        lastSeenAt: hoursAgo(3),
      },
    ]);
    await tx.insert(captureSessions).values([
      {
        id: ids.session[0],
        organizationId: ids.organization,
        consumerId: ids.consumer[0],
        sessionId: "seed-session-echo",
        startedAt: hoursAgo(2),
        endedAt: hoursAgo(1),
        sessionComplete: true,
      },
      {
        id: ids.session[1],
        organizationId: ids.organization,
        consumerId: ids.consumer[1],
        sessionId: "seed-session-pattern",
        startedAt: hoursAgo(4),
        endedAt: hoursAgo(3),
        sessionComplete: true,
      },
      {
        id: ids.session[2],
        organizationId: ids.organization,
        consumerId: ids.consumer[2],
        sessionId: "seed-session-exposure",
        startedAt: hoursAgo(6),
        endedAt: hoursAgo(5),
        sessionComplete: false,
      },
    ]);
    await tx.insert(captureBatches).values({
      organizationId: ids.organization,
      agentId: ids.agent,
      batchId: "seed-batch-all-tiers",
      response: {
        accepted_count: 4,
        rejected_count: 0,
        statuses: ["accepted", "accepted", "accepted", "accepted"],
      },
    });

    const behaviorFixtures = [
      {
        key: "idempotency-echo",
        kind: "shape",
        operationIndex: 0,
        consumerIndex: 0,
        sessionIndex: 0,
        path: "$.response.body.idempotency_key",
        label: "Echoed idempotency key",
        title: "Echoed idempotency key",
        count: 24,
        receiptExcerpt: {
          method: "POST",
          path_template: "/v1/orders",
          response_path: "$.response.body.idempotency_key",
          echoed_request_path: "$.request.headers.idempotency-key",
          value_hash: "h_seed_idempotency_key",
        },
        replayBefore: { field: "idempotency_key", present: true },
        replayAfter: { field: "idempotency_key", present: false },
      },
      {
        key: "validation-error-template",
        kind: "error",
        operationIndex: 2,
        consumerIndex: 1,
        sessionIndex: 1,
        path: "$.response.error.template",
        label: "Validation error template branch",
        title: "Validation error template branch",
        count: 11,
        receiptExcerpt: {
          method: "PATCH",
          path_template: "/v1/orders/{id}",
          status: 422,
          error_template_hash: "h_seed_validation_template",
        },
        replayBefore: { template: "quantity must be positive" },
        replayAfter: { template: "invalid quantity" },
      },
      {
        key: "legacy-field-exposure",
        kind: "shape",
        operationIndex: 1,
        consumerIndex: 2,
        sessionIndex: 2,
        path: "$.response.body.legacy_id",
        label: "Legacy field exposure",
        title: "Legacy field exposure",
        count: 5,
        receiptExcerpt: {
          method: "GET",
          path_template: "/v1/orders/{id}",
          response_path: "$.response.body.legacy_id",
          value_hash: "h_seed_legacy_id",
        },
        replayBefore: { field: "legacy_id", present: true },
        replayAfter: { field: "legacy_id", present: true },
      },
      {
        key: "deletion-status-exposure",
        kind: "status",
        operationIndex: 3,
        consumerIndex: 2,
        sessionIndex: 2,
        path: "$.response.status",
        label: "Undeclared deletion status exposure",
        title: "Undeclared deletion status",
        count: 2,
        receiptExcerpt: null,
        replayBefore: { status: 204 },
        replayAfter: { status: 204 },
      },
    ] as const;
    await tx.insert(behaviorDefinitions).values(
      behaviorFixtures.map((fixture, index) => ({
        id: required(ids.behavior, index),
        organizationId: ids.organization,
        fingerprintDigest: digest(String(index + 2)),
        kind: fixture.kind,
        extractorVersion: "extractor-go-seed-v1",
        fingerprint: {
          path: fixture.path,
          operation: required(ids.operation, fixture.operationIndex),
        },
        declared: false,
        label: fixture.label,
      })),
    );
    await tx.insert(behaviorObservations).values(
      behaviorFixtures.map((fixture, index) => ({
        organizationId: ids.organization,
        operationId: required(ids.operation, fixture.operationIndex),
        consumerId: required(ids.consumer, fixture.consumerIndex),
        behaviorId: required(ids.behavior, index),
        captureSessionId: required(ids.session, fixture.sessionIndex),
        eventId: `seed-event-${index + 1}`,
        count: fixture.count,
        firstSeenAt: hoursAgo(20 - index),
        lastSeenAt: hoursAgo(index + 1),
      })),
    );
    await tx.insert(receipts).values(
      behaviorFixtures.flatMap((fixture, index) =>
        fixture.receiptExcerpt === null
          ? []
          : [
              {
                id: required(ids.receipt, index),
                organizationId: ids.organization,
                behaviorId: required(ids.behavior, index),
                consumerId: required(ids.consumer, fixture.consumerIndex),
                operationId: required(ids.operation, fixture.operationIndex),
                captureSessionId: required(ids.session, fixture.sessionIndex),
                objectKey: `${ids.organization}/receipts/seed-${index + 1}.json`,
                digest: digest(["6", "7", "8"][index] ?? "6"),
                redactionVersion: "redaction-v1",
                sequenceStart: index * 10 + 1,
                sequenceEnd: index * 10 + 3,
                excerpt: fixture.receiptExcerpt,
                expiresAt: daysFromNow(90),
              },
            ],
      ),
    );

    const tiers = ["T1", "T2", "T3", "T3"] as const;
    const states = ["active", "active", "active", "stale"] as const;
    await tx.insert(dependencyClaims).values(
      tiers.map((tier, index) => ({
        id: required(ids.claim, index),
        organizationId: ids.organization,
        behaviorId: required(ids.behavior, index),
        consumerId: required(ids.consumer, required(behaviorFixtures, index).consumerIndex),
        tier,
        state: required(states, index),
        confidence: [100, 82, 35, 20][index] ?? 0,
        evidence: { observation_count: [24, 11, 5, 2][index], deterministic: tier === "T1" },
        receiptId: index < 3 ? required(ids.receipt, index) : null,
      })),
    );
    await tx.insert(ledgerEntries).values(
      tiers.map((tier, index) => ({
        id: required(ids.ledger, index),
        organizationId: ids.organization,
        claimId: required(ids.claim, index),
        behaviorId: required(ids.behavior, index),
        consumerId: required(ids.consumer, required(behaviorFixtures, index).consumerIndex),
        operationId: required(ids.operation, required(behaviorFixtures, index).operationIndex),
        tier,
        state: required(states, index),
        title: required(behaviorFixtures, index).title,
        lastSeenAt: hoursAgo(index + 1),
        freshnessUntil: daysFromNow(index === 3 ? -1 : 90),
        receiptId: index < 3 ? required(ids.receipt, index) : null,
      })),
    );
    await tx.insert(assertions).values([
      {
        id: ids.assertion[0],
        organizationId: ids.organization,
        behaviorId: ids.behavior[0],
        claimId: ids.claim[0],
        ownerId: ids.user,
        reason: "Checkout retries require the echoed idempotency key.",
        policy: { replay: "required" },
        status: "active",
        expiresAt: daysFromNow(90),
      },
      {
        id: ids.assertion[1],
        organizationId: ids.organization,
        behaviorId: ids.behavior[1],
        claimId: ids.claim[1],
        ownerId: ids.user,
        reason: "Support parsing migration is in progress.",
        status: "expired",
        expiresAt: daysFromNow(-1),
      },
      {
        id: ids.assertion[2],
        organizationId: ids.organization,
        behaviorId: ids.behavior[2],
        claimId: ids.claim[2],
        ownerId: ids.user,
        reason: "Exposure was reviewed and deliberately removed.",
        status: "resolved",
        expiresAt: daysFromNow(30),
      },
    ]);

    await tx.insert(gatePolicies).values({
      id: ids.policy,
      organizationId: ids.organization,
      version: 1,
      blockTiers: ["T1"],
      warnTiers: ["T2"],
      active: true,
    });
    await tx.insert(replayCorpora).values({
      id: ids.corpus,
      organizationId: ids.organization,
      version: "seed-v1",
      digest: digest("9"),
      objectKey: `${ids.organization}/corpora/seed-v1.json`,
    });
    await tx.insert(corpusItems).values(
      behaviorFixtures.map((fixture, index) => ({
        organizationId: ids.organization,
        corpusId: ids.corpus,
        caseId: `seed-${fixture.key}-case`,
        operationId: required(ids.operation, fixture.operationIndex),
        consumerId: required(ids.consumer, fixture.consumerIndex),
        coverageClass: index === 0 ? "T1" : index === 1 ? "T2" : "exposure",
        objectKey: `${ids.organization}/corpora/seed-${fixture.key}.json`,
        digest: digest(["a", "b", "c", "d"][index] ?? "a"),
      })),
    );
    await tx.insert(replayRuns).values({
      id: ids.replay,
      organizationId: ids.organization,
      reportVersion: "1",
      baseUrl: "https://base.seed.example.test",
      candidateUrl: "https://candidate.seed.example.test",
      baseImageDigest: digest("a"),
      candidateImageDigest: digest("b"),
      extractorVersion: "extractor-go-seed-v1",
      corpusDigest: digest("9"),
      fixtureDigest: digest("c"),
      maskDigest: digest("d"),
      runnerVersion: "runner-seed-v1",
      policyId: ids.policy,
      policyVersion: 1,
      runs: 3,
      outcome: "block",
      reportDigest: digest("e"),
      signatureKeyId: ids.agent,
      signatureVerified: true,
      generatedAt: hoursAgo(1),
    });
    await tx.insert(replayDeltas).values(
      [0, 1].map((index) => {
        const fixture = required(behaviorFixtures, index);
        return {
          organizationId: ids.organization,
          replayRunId: ids.replay,
          caseId: `seed-${fixture.key}-case`,
          kind: fixture.kind,
          path: fixture.path,
          digest: digest(["f", "0", "1"][index] ?? "f"),
          stable: true,
          quarantined: false,
          before: fixture.replayBefore,
          after: fixture.replayAfter,
          matches: [{ claim_id: required(ids.claim, index) }],
        };
      }),
    );
    await tx.insert(replayAssertionResults).values(
      [0].map((index) => ({
        organizationId: ids.organization,
        replayRunId: ids.replay,
        assertionId: required(ids.assertion, index),
        behaviorId: required(ids.behavior, index),
        claimId: required(ids.claim, index),
        caseId: `seed-${required(behaviorFixtures, index).key}-case`,
        outcome: "fail" as const,
      })),
    );
    await tx.insert(gateDecisions).values({
      id: ids.gate,
      organizationId: ids.organization,
      replayRunId: ids.replay,
      policyId: ids.policy,
      outcome: "block",
      blockCount: 2,
      warnCount: 1,
      noteCount: 0,
      reasons: [
        "1 blocking claim(s) matched stable deltas",
        "1 pinned assertion(s) failed replay",
        "1 warning claim(s) matched stable deltas",
      ],
    });

    await tx.insert(jobs).values(
      ["pending", "running", "succeeded", "failed", "dead"].map((status, index) => ({
        organizationId: ids.organization,
        type: "assertion.expire",
        payload: { assertion_id: ids.assertion[index % 3] },
        status: status as "pending" | "running" | "succeeded" | "failed" | "dead",
        attempts: index,
        runAfter: daysFromNow(index),
        idempotencyKey: `seed-job-${status}`,
        lastError:
          status === "failed" || status === "dead"
            ? "seeded failure for UI and worker testing"
            : null,
      })),
    );
    await tx.insert(outboxEvents).values([
      {
        organizationId: ids.organization,
        topic: "integration.gate_decided",
        idempotencyKey: "seed-outbox-pending",
        payload: { replay_run_id: ids.replay },
      },
      {
        organizationId: ids.organization,
        topic: "integration.gate_decided",
        idempotencyKey: "seed-outbox-published",
        payload: { replay_run_id: ids.replay },
        publishedAt: hoursAgo(1),
      },
    ]);
    await tx.insert(progressEvents).values([
      {
        organizationId: ids.organization,
        topic: "capture.batch_ingested",
        resourceId: "seed-batch-all-tiers",
        payload: { accepted_count: 4 },
        createdAt: hoursAgo(4),
      },
      {
        organizationId: ids.organization,
        topic: "ledger.updated",
        resourceId: ids.ledger[0],
        payload: { tier: "T1" },
        createdAt: hoursAgo(3),
      },
      {
        organizationId: ids.organization,
        topic: "assertion.pinned",
        resourceId: ids.assertion[0],
        payload: { behavior_id: ids.behavior[0] },
        createdAt: hoursAgo(2),
      },
      {
        organizationId: ids.organization,
        topic: "replay.report_ingested",
        resourceId: ids.replay,
        payload: { outcome: "block" },
        createdAt: hoursAgo(1),
      },
    ]);
    await tx.insert(auditEvents).values({
      organizationId: ids.organization,
      actorId: ids.user,
      action: "seed.created",
      resourceType: "organization",
      resourceId: ids.organization,
      metadata: { fixtures: "all relational tables" },
    });
    await tx.insert(llmRuns).values({
      id: "b0000000-0000-4000-8000-000000000001",
      organizationId: ids.organization,
      task: "label_behavior",
      model: "gpt-5.6",
      promptVersion: "seed-v1",
      schemaVersion: "1",
      responseId: "resp_seed",
      status: "completed",
      inputDigest: digest("2"),
      resultDigest: digest("3"),
      tokenUsage: { input_tokens: 128, output_tokens: 32 },
      result: { label: "Echoed idempotency key", advisory: true },
    });
    return "created" as const;
  });
  process.stdout.write(
    result === "created"
      ? `Seeded organization ${ids.organization}\n`
      : `Seed organization ${ids.organization} already exists; no changes made\n`,
  );
} finally {
  await database.close();
}
