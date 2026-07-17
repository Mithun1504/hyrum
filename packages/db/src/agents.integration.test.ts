import { createHash } from "node:crypto";
import type { ProcessedCaptureSession } from "@hyrum/contracts";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAgent,
  getAgentConfiguration,
  listAgents,
  persistIngestionBatch,
  recordAgentHeartbeat,
  resolveMachineCredential,
  revokeAgent,
  rotateAgentCredential,
} from "./agents";
import {
  createAssertion,
  extendAssertion,
  listAssertions,
  scheduleBreakingChange,
} from "./assertions";
import { requestBehaviorLabelProposal, requestTierProposal } from "./behavior-advisories";
import { listCorpusCandidates, listReplayCorpora, persistReplayCorpus } from "./corpora";
import { inferDeterministicClaims } from "./evidence-inference";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { processIngestionSessions } from "./ingestion-processing";
import { listLedger, reviewLedgerClaim } from "./ledger";
import { createReplayRun, persistReplayReport, resolveRunnerCredential } from "./replay-runs";
import {
  apiOperations,
  apiSpecOperations,
  apiSpecs,
  assertionConsumers,
  assertionEvents,
  behaviorDefinitions,
  behaviorObservations,
  behaviorSpecClassifications,
  breakingChangeImpacts,
  breakingChangePlans,
  captureSessions,
  ciRunnerSessions,
  claimEvidence,
  claimReviewDecisions,
  consumers,
  corpusItems,
  deltaAssertionMatches,
  deltaClaimMatches,
  dependencyClaims,
  extractorReleases,
  gateDecisions,
  gateImpacts,
  ingestionBatches,
  jobs,
  ledgerEntries,
  receipts,
  redactionPolicyVersions,
  replayAttempts,
  replayDeltas,
  replayRuns,
  samplingPolicyVersions,
} from "./schema";
import { createApiService } from "./services";
import { withOrganizationContext } from "./tenancy";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

suite("capture agent repository integration", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 1);
  });

  afterAll(async () => {
    await client.close();
  });

  it("issues, resolves, rotates, and revokes tenant-scoped agent credentials", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_agent_${suffix}`,
      organizationName: "Agent Test",
      organizationSlug: `agent-test-${suffix}`,
      workosUserId: `user_agent_${suffix}`,
      userEmail: `agent-${suffix}@example.test`,
      userDisplayName: "Agent Admin",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_agent_${suffix}`,
      role: "admin",
      status: "active",
    });
    const service = await createApiService(
      client.db,
      identity.organizationId,
      {
        userId: identity.userId,
        membershipId: identity.membershipId,
        requestId: `request-${suffix}`,
      },
      {
        name: "Capture API",
        slug: `capture-api-${suffix}`,
        environment: { name: "Production", slug: "production", kind: "production" },
      },
    );

    const configuration = await withOrganizationContext(
      client.db,
      identity.organizationId,
      async (tx) => {
        const [extractor] = await tx
          .select()
          .from(extractorReleases)
          .where(eq(extractorReleases.semanticVersion, "1.0.0"))
          .limit(1);
        const [redaction] = await tx
          .select()
          .from(redactionPolicyVersions)
          .where(
            and(
              eq(redactionPolicyVersions.apiServiceId, service.id),
              eq(redactionPolicyVersions.status, "active"),
            ),
          )
          .limit(1);
        const [sampling] = await tx
          .select()
          .from(samplingPolicyVersions)
          .where(
            and(
              eq(samplingPolicyVersions.apiServiceId, service.id),
              eq(samplingPolicyVersions.status, "active"),
            ),
          )
          .limit(1);
        if (!extractor || !redaction || !sampling) throw new Error("Configuration fixture failed");
        return { extractor, redaction, sampling };
      },
    );

    const created = await createAgent(
      client.db,
      identity.organizationId,
      service.id,
      { userId: identity.userId, requestId: `request-agent-${suffix}` },
      {
        name: "Production capture",
        environmentId: service.defaultEnvironment.id,
        externalInstanceKey: `capture/${suffix}`,
        adapterType: "ndjson",
        agentVersion: "1.0.0",
        extractorReleaseId: configuration.extractor.id,
        redactionPolicyVersionId: configuration.redaction.id,
        samplingPolicyVersionId: configuration.sampling.id,
        credentialExpiresInDays: 90,
      },
      {
        tokenPrefix: `prefix-${suffix}`,
        tokenHash: "fixture-argon-hash",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    );

    const principal = await resolveMachineCredential(client, `prefix-${suffix}`);
    expect(principal).toMatchObject({
      organizationId: identity.organizationId,
      agentId: created.agent.id,
      scopes: ["config:read", "heartbeat:write", "ingestion:write"],
    });
    if (!principal) throw new Error("Credential did not resolve");
    await expect(getAgentConfiguration(client.db, principal)).resolves.toMatchObject({
      extractor: { semanticVersion: configuration.extractor.semanticVersion },
      sampling: { sessionWindowSeconds: 900, lowVolumeBoost: 3 },
    });
    await expect(
      recordAgentHeartbeat(client.db, principal, { agentVersion: "1.0.1", status: "online" }),
    ).resolves.toBe(1);
    await expect(listAgents(client.db, identity.organizationId, service.id)).resolves.toHaveLength(
      1,
    );

    const operationKey = "a".repeat(64);
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      await tx.insert(apiOperations).values({
        organizationId: identity.organizationId,
        apiServiceId: service.id,
        httpMethod: "GET",
        normalizedPathTemplate: "/items",
        operationKey,
        firstSeenAt: new Date("2026-07-15T10:00:00Z"),
        lastSeenAt: new Date("2026-07-15T10:00:00Z"),
      });
    });
    const session: ProcessedCaptureSession = {
      schema_version: 1,
      extractor_version: "1.0.0",
      consumer_hmac: `hmac-sha256:${"1".repeat(64)}`,
      session_hmac: `hmac-sha256:${"2".repeat(64)}`,
      started_at: "2026-07-15T10:00:00.000Z",
      ended_at: "2026-07-15T10:00:01.000Z",
      first_sequence: 1,
      last_sequence: 2,
      completeness: "complete",
      correlation_source: "time_window",
      sampling_probability: 0.5,
      low_volume_boosted: true,
      exchanges: [
        {
          sequence: 1,
          operation_key: operationKey,
          request_method: "GET",
          request_path: "/items",
          response_status: 200,
          response_body: { next_cursor: `hmac-sha256:${"9".repeat(64)}` },
        },
        {
          sequence: 2,
          operation_key: operationKey,
          request_method: "GET",
          request_path: "/items",
          request_query: { cursor: `hmac-sha256:${"9".repeat(64)}` },
          response_status: 200,
          response_body: { items: [] },
        },
      ],
      extraction: {
        schema_version: 1,
        extractor_version: "1.0.0",
        fingerprints: [
          {
            operation_key: operationKey,
            kind: "shape",
            schema_version: 1,
            canonical: { nodes: [] },
            digest: "3".repeat(64),
            default_label: "Response shape",
            observation_count: 1,
          },
        ],
        echoes: [
          {
            source_sequence: 1,
            destination_sequence: 2,
            source_path: "$response/next_cursor",
            destination_path: "$request/query/cursor",
            value_token: `hmac-sha256:${"9".repeat(64)}`,
            source_operation_key: operationKey,
            source_shape_digest: "3".repeat(64),
          },
        ],
      },
    };
    const persisted = await persistIngestionBatch(
      client.db,
      principal,
      {
        agentBatchId: `batch-${suffix}`,
        payloadDigest: "4".repeat(64),
        schemaVersion: 1,
        extractorReleaseId: configuration.extractor.id,
        redactionPolicyVersionId: configuration.redaction.id,
        samplingPolicyVersionId: configuration.sampling.id,
        acceptedItemCount: 1,
        rejectedItemCount: 0,
        rejections: [],
      },
      {
        bucket: "fixture",
        objectKey: `${identity.organizationId}/capture-batch/${suffix}`,
        byteSize: 100,
        sha256Digest: "5".repeat(64),
        contentType: "application/json",
        contentEncoding: null,
      },
      null,
    );
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      await expect(
        processIngestionSessions(
          tx,
          identity.organizationId,
          persisted.batchId,
          [session],
          new Map([
            [
              session.session_hmac,
              {
                bucket: "fixture",
                objectKey: `${identity.organizationId}/receipt-bundle/${suffix}`,
                byteSize: 100,
                sha256Digest: "6".repeat(64),
                contentType: "application/json",
                contentEncoding: null,
              },
            ],
          ]),
        ),
      ).resolves.toMatchObject({ processedSessions: 1, processedFingerprints: 1 });
      const [operation] = await tx
        .select({ id: apiOperations.id })
        .from(apiOperations)
        .where(
          and(
            eq(apiOperations.organizationId, identity.organizationId),
            eq(apiOperations.operationKey, operationKey),
          ),
        );
      const [behavior] = await tx
        .select({ id: behaviorDefinitions.id })
        .from(behaviorDefinitions)
        .where(
          and(
            eq(behaviorDefinitions.organizationId, identity.organizationId),
            eq(behaviorDefinitions.fingerprintDigest, "3".repeat(64)),
          ),
        );
      const [batchObject] = await tx
        .select({ id: ingestionBatches.storedObjectId })
        .from(ingestionBatches)
        .where(eq(ingestionBatches.id, persisted.batchId));
      if (!operation || !behavior || !batchObject) throw new Error("Evidence fixture failed");
      const [spec] = await tx
        .insert(apiSpecs)
        .values({
          organizationId: identity.organizationId,
          apiServiceId: service.id,
          versionLabel: "evidence-fixture",
          source: "upload",
          originalObjectId: batchObject.id,
          normalizedObjectId: batchObject.id,
          originalDigest: `original-${suffix}`,
          normalizedDigest: `normalized-${suffix}`,
          openapiVersion: "3.1.0",
          validationStatus: "valid",
          isCurrent: true,
          uploadedByMembershipId: identity.membershipId,
        })
        .returning({ id: apiSpecs.id });
      if (!spec) throw new Error("Spec fixture failed");
      await tx.insert(apiSpecOperations).values({
        organizationId: identity.organizationId,
        apiSpecId: spec.id,
        apiOperationId: operation.id,
        normalizedContract: { operation: { responses: { 200: { description: "ok" } } } },
        contractDigest: `contract-${suffix}`,
      });
      await tx.insert(behaviorSpecClassifications).values({
        organizationId: identity.organizationId,
        behaviorDefinitionId: behavior.id,
        apiSpecId: spec.id,
        status: "undeclared",
        reasonCode: "fixture_undeclared",
        comparisonDetails: {},
        comparatorVersion: "spec-subtraction-v1",
      });
      await expect(
        inferDeterministicClaims(
          tx,
          identity.organizationId,
          persisted.batchId,
          [session],
          [
            {
              sessionHmac: session.session_hmac,
              receiptType: "exposure",
              bucket: "fixture",
              objectKey: `${identity.organizationId}/receipt-bundle/exposure-${suffix}`,
              byteSize: 100,
              sha256Digest: `${"6".repeat(63)}a`,
              bundleDigest: `${"8".repeat(63)}a`,
              contentType: "application/json",
              contentEncoding: null,
            },
            {
              sessionHmac: session.session_hmac,
              receiptType: "t1_echo",
              bucket: "fixture",
              objectKey: `${identity.organizationId}/receipt-bundle/t1-${suffix}`,
              byteSize: 100,
              sha256Digest: `${"7".repeat(63)}b`,
              bundleDigest: `${"8".repeat(63)}b`,
              contentType: "application/json",
              contentEncoding: null,
            },
          ],
        ),
      ).resolves.toMatchObject({ receipts: 2, claims: 1, evidence: 1 });
      const [batchRow] = await tx
        .select({ status: ingestionBatches.status })
        .from(ingestionBatches)
        .where(eq(ingestionBatches.id, persisted.batchId));
      expect(batchRow?.status).toBe("processed");
      await expect(
        tx.select().from(consumers).where(eq(consumers.organizationId, identity.organizationId)),
      ).resolves.toHaveLength(1);
      await expect(
        tx
          .select()
          .from(captureSessions)
          .where(eq(captureSessions.organizationId, identity.organizationId)),
      ).resolves.toHaveLength(1);
      await expect(
        tx
          .select()
          .from(behaviorDefinitions)
          .where(eq(behaviorDefinitions.organizationId, identity.organizationId)),
      ).resolves.toHaveLength(1);
      const observations = await tx
        .select()
        .from(behaviorObservations)
        .where(eq(behaviorObservations.organizationId, identity.organizationId));
      expect(observations).toHaveLength(1);
      expect(Number(observations[0]?.sampleWeight)).toBe(2);
      await expect(
        tx.select().from(receipts).where(eq(receipts.organizationId, identity.organizationId)),
      ).resolves.toHaveLength(2);
      await expect(
        tx
          .select()
          .from(dependencyClaims)
          .where(eq(dependencyClaims.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([{ tier: "t1", status: "active", deterministicEligible: true }]);
      await expect(
        tx
          .select()
          .from(claimEvidence)
          .where(eq(claimEvidence.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([
        { evidenceRole: "primary", responseSequenceNo: 1n, requestSequenceNo: 2n },
      ]);
      await expect(
        tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.organizationId, identity.organizationId)),
      ).resolves.toHaveLength(1);
    });

    const ledgerPage = await listLedger(client.db, identity.organizationId, service.id, {
      limit: 10,
    });
    expect(ledgerPage.records).toHaveLength(1);
    expect(ledgerPage.nextCursor).toBeNull();
    const ledgerEntry = ledgerPage.records[0];
    if (!ledgerEntry) throw new Error("Ledger projection fixture failed");

    const behaviorLabelRun = await requestBehaviorLabelProposal(
      client.db,
      identity.organizationId,
      ledgerEntry.behavior.id,
      { userId: identity.userId, requestId: `behavior-label-${suffix}` },
      {
        version: 1,
        model: "gpt-5.6",
        promptDigest: "a".repeat(64),
        schemaDigest: "b".repeat(64),
        sourceRevision: "integration-fixture-v1",
      },
    );
    expect(behaviorLabelRun).toMatchObject({ status: "queued" });
    const tierProposalRun = await requestTierProposal(
      client.db,
      identity.organizationId,
      ledgerEntry.dependencyClaimId,
      { userId: identity.userId, requestId: `tier-proposal-${suffix}` },
      {
        version: 1,
        model: "gpt-5.6",
        promptDigest: "c".repeat(64),
        schemaDigest: "d".repeat(64),
        sourceRevision: "integration-fixture-v1",
      },
    );
    expect(tierProposalRun).toMatchObject({ status: "queued" });
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      const advisoryJobs = await tx
        .select({ type: jobs.type })
        .from(jobs)
        .where(eq(jobs.organizationId, identity.organizationId));
      expect(advisoryJobs).toEqual(
        expect.arrayContaining([
          { type: "generate_behavior_label" },
          { type: "generate_tier_proposal" },
        ]),
      );
    });
    await expect(
      reviewLedgerClaim(
        client.db,
        identity.organizationId,
        ledgerEntry.id,
        {
          membershipId: identity.membershipId,
          userId: identity.userId,
          requestId: `review-${suffix}`,
        },
        {
          decision: "confirmed",
          reason: "Verified against the complete deterministic echo receipt.",
          expectedUpdatedAt: ledgerEntry.updatedAt,
        },
      ),
    ).resolves.toMatchObject({ reviewState: "confirmed" });
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      await expect(
        tx
          .select()
          .from(claimReviewDecisions)
          .where(eq(claimReviewDecisions.organizationId, identity.organizationId)),
      ).resolves.toHaveLength(1);
    });

    const initialExpiry = new Date(Date.now() + 30 * 86_400_000);
    await expect(
      createAssertion(
        client.db,
        identity.organizationId,
        service.id,
        {
          membershipId: identity.membershipId,
          userId: identity.userId,
          requestId: `assertion-${suffix}`,
        },
        {
          behaviorDefinitionId: ledgerEntry.behavior.id,
          sourceClaimId: ledgerEntry.dependencyClaimId,
          ownerMembershipId: identity.membershipId,
          reason: "Preserve the cursor contract while consumers migrate safely.",
          scope: "selected_consumers",
          consumerIds: [ledgerEntry.consumer.id],
          expiresAt: initialExpiry,
        },
      ),
    ).resolves.toMatchObject({ id: expect.any(String) });
    const [initialAssertion] = await listAssertions(client.db, identity.organizationId, service.id);
    if (!initialAssertion) throw new Error("Assertion fixture failed");
    const extendedExpiry = new Date(Date.now() + 60 * 86_400_000);
    const replacement = await extendAssertion(
      client.db,
      identity.organizationId,
      initialAssertion.id,
      {
        membershipId: identity.membershipId,
        userId: identity.userId,
        requestId: `extend-${suffix}`,
      },
      {
        expiresAt: extendedExpiry,
        reason: "The migration needs a longer compatibility window with explicit review.",
        expectedUpdatedAt: initialAssertion.updatedAt,
      },
    );
    const plan = await scheduleBreakingChange(
      client.db,
      identity.organizationId,
      replacement.id,
      {
        membershipId: identity.membershipId,
        userId: identity.userId,
        requestId: `schedule-${suffix}`,
      },
      {
        plannedFor: new Date(Date.now() + 40 * 86_400_000),
        communicationDueAt: new Date(Date.now() + 35 * 86_400_000),
        reason: "Remove the legacy cursor only after the frozen impact set is reviewed.",
        expectedUpdatedAt: replacement.updatedAt,
      },
    );
    expect(plan.impactCount).toBe(1);
    const corpusFixture = await withOrganizationContext(
      client.db,
      identity.organizationId,
      async (tx) => {
        await expect(
          tx
            .select()
            .from(assertionConsumers)
            .where(eq(assertionConsumers.organizationId, identity.organizationId)),
        ).resolves.toHaveLength(2);
        await expect(
          tx
            .select()
            .from(assertionEvents)
            .where(eq(assertionEvents.organizationId, identity.organizationId)),
        ).resolves.toHaveLength(4);
        await expect(
          tx
            .select()
            .from(breakingChangePlans)
            .where(eq(breakingChangePlans.organizationId, identity.organizationId)),
        ).resolves.toHaveLength(1);
        await expect(
          tx
            .select()
            .from(breakingChangeImpacts)
            .where(eq(breakingChangeImpacts.organizationId, identity.organizationId)),
        ).resolves.toHaveLength(1);

        const candidates = await listCorpusCandidates(tx, identity.organizationId, service.id);
        expect(candidates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              assertionId: replacement.id,
              coverageClass: "assertion",
              extractorReleaseId: configuration.extractor.id,
              normalizedPathTemplate: "/items",
            }),
            expect.objectContaining({ assertionId: null, coverageClass: "shape" }),
          ]),
        );
        const manifestItems = candidates.slice(0, 2).map((candidate, index) => ({
          apiOperationId: candidate.apiOperationId,
          consumerId: candidate.consumerId,
          behaviorDefinitionId: candidate.behaviorDefinitionId,
          assertionId: candidate.assertionId,
          coverageClass: candidate.coverageClass,
          objectOffset: BigInt(index * 100),
          requestDigest: `${index + 1}`.repeat(64),
          method: "GET",
          normalizedPath: candidate.normalizedPathTemplate,
          safeMethod: true,
          requiresFixture: false,
          selectionReason: candidate.assertionId ? "active-assertion" : "coverage",
          priorityRank: index + 1,
        }));
        const corpus = await persistReplayCorpus(
          tx,
          identity.organizationId,
          service.id,
          {
            bucket: "fixture",
            objectKey: `${identity.organizationId}/replay-corpus/${suffix}`,
            byteSize: 200,
            sha256Digest: "c".repeat(64),
            contentType: "application/x-ndjson",
            contentEncoding: null,
          },
          manifestItems,
          {
            start: new Date("2026-07-15T10:00:00.000Z"),
            end: new Date("2026-07-15T10:00:01.000Z"),
          },
        );
        expect(corpus).toMatchObject({ created: true, version: 1 });
        await expect(
          tx
            .select()
            .from(corpusItems)
            .where(eq(corpusItems.organizationId, identity.organizationId)),
        ).resolves.toHaveLength(manifestItems.length);
        await expect(
          listReplayCorpora(tx, identity.organizationId, service.id),
        ).resolves.toMatchObject([
          { version: 1, status: "ready", itemCount: manifestItems.length },
        ]);
        const target = manifestItems.find((item) => item.assertionId === replacement.id);
        if (!target?.behaviorDefinitionId) throw new Error("Assertion corpus fixture failed");
        return { id: corpus.id, target };
      },
    );

    const replay = await createReplayRun(
      client.db,
      identity.organizationId,
      service.id,
      { userId: identity.userId, requestId: `replay-${suffix}` },
      {
        replayCorpusId: corpusFixture.id,
        baseImageDigest: `sha256:${"b".repeat(64)}`,
        candidateImageDigest: `sha256:${"d".repeat(64)}`,
        triggerIdempotencyKey: `manual-${suffix}`,
        runnerVersion: "1.0.0",
        reportSigningPublicKey: "fixture-public-key-material-that-is-long-enough",
        signingKeyId: `key-${suffix}`,
      },
      {
        tokenPrefix: `runner-${suffix}`,
        tokenHash: "fixture-runner-hash",
        nonceDigest: "e".repeat(64),
        expiresAt: new Date(Date.now() + 900_000),
      },
    );
    expect(replay).toMatchObject({ status: "queued", replayCorpusId: corpusFixture.id });
    const runner = await resolveRunnerCredential(client, `runner-${suffix}`);
    expect(runner).toMatchObject({
      organizationId: identity.organizationId,
      replayRunId: replay.id,
      nonceDigest: "e".repeat(64),
    });
    if (!runner) throw new Error("Runner credential fixture failed");
    const immutable = await withOrganizationContext(
      client.db,
      identity.organizationId,
      async (tx) => {
        const [record] = await tx
          .select({
            fixtureDigest: replayRuns.fixtureDigest,
            maskDigest: replayRuns.maskDigest,
          })
          .from(replayRuns)
          .where(eq(replayRuns.id, replay.id));
        return record;
      },
    );
    if (!immutable) throw new Error("Replay immutable input fixture failed");
    const normalizedBefore = { nodes: [{ path: "$.items", type: "array" }] };
    const normalizedAfter = { nodes: [{ path: "$.results", type: "array" }] };
    const deltaDigest = createHash("sha256")
      .update(
        stableJson({
          api_operation_id: corpusFixture.target.apiOperationId,
          consumer_id: corpusFixture.target.consumerId,
          kind: "shape",
          request_digest: corpusFixture.target.requestDigest,
          before_digest: "1".repeat(64),
          after_digest: "2".repeat(64),
          normalized_before: normalizedBefore,
          normalized_after: normalizedAfter,
        }),
      )
      .digest("hex");
    await expect(
      persistReplayReport(
        client.db,
        runner,
        {
          schema_version: 1,
          replay_run_id: replay.id,
          corpus_digest: "c".repeat(64),
          base_image_digest: `sha256:${"b".repeat(64)}`,
          candidate_image_digest: `sha256:${"d".repeat(64)}`,
          fixture_digest: immutable.fixtureDigest,
          mask_digest: immutable.maskDigest,
          runner_version: "1.0.0",
          nonce_digest: runner.nonceDigest,
          extractor_version: "1.0.0",
          attempts: 2,
          started_at: new Date(Date.now() - 1_000).toISOString(),
          completed_at: new Date().toISOString(),
          deltas: [
            {
              api_operation_id: corpusFixture.target.apiOperationId,
              behavior_definition_id: corpusFixture.target.behaviorDefinitionId,
              consumer_id: corpusFixture.target.consumerId,
              assertion_id: corpusFixture.target.assertionId,
              request_digest: corpusFixture.target.requestDigest,
              kind: "shape",
              delta_digest: deltaDigest,
              before_digest: "1".repeat(64),
              after_digest: "2".repeat(64),
              normalized_before: normalizedBefore,
              normalized_after: normalizedAfter,
              stability: "stable",
              agreeing_attempts: 2,
              total_attempts: 2,
            },
          ],
        },
        {
          bucket: "fixture",
          objectKey: `${identity.organizationId}/replay-report/${suffix}`,
          byteSize: 200,
          sha256Digest: "f".repeat(64),
          contentType: "application/json",
          contentEncoding: null,
        },
        `report-${suffix}`,
      ),
    ).resolves.toMatchObject({ replayRunId: replay.id, deltaCount: 1 });
    await expect(resolveRunnerCredential(client, `runner-${suffix}`)).resolves.toBeNull();
    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      await expect(
        tx
          .select()
          .from(replayAttempts)
          .where(eq(replayAttempts.organizationId, identity.organizationId)),
      ).resolves.toHaveLength(2);
      await expect(
        tx
          .select()
          .from(ciRunnerSessions)
          .where(eq(ciRunnerSessions.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([{ replayRunId: replay.id, consumedAt: expect.any(Date) }]);
      await expect(
        tx.select().from(replayRuns).where(eq(replayRuns.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([
        { id: replay.id, status: "succeeded", signatureVerifiedAt: expect.any(Date) },
      ]);
      await expect(
        tx
          .select()
          .from(replayDeltas)
          .where(eq(replayDeltas.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([
        { replayRunId: replay.id, stability: "stable", agreeingAttempts: 2, totalAttempts: 2 },
      ]);
      await expect(
        tx
          .select()
          .from(deltaClaimMatches)
          .where(eq(deltaClaimMatches.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([{ matched: true, ineligibilityReason: null }]);
      await expect(
        tx
          .select()
          .from(deltaAssertionMatches)
          .where(eq(deltaAssertionMatches.organizationId, identity.organizationId)),
      ).resolves.toMatchObject([
        { assertionId: replacement.id, matched: true, ineligibilityReason: null },
      ]);
      const decisions = await tx
        .select()
        .from(gateDecisions)
        .where(eq(gateDecisions.organizationId, identity.organizationId));
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({ replayRunId: replay.id, outcome: "block" });
      expect(decisions[0]?.blockingImpactCount).toBeGreaterThanOrEqual(1);
      await expect(
        tx
          .select()
          .from(gateImpacts)
          .where(eq(gateImpacts.organizationId, identity.organizationId)),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            consumerId: corpusFixture.target.consumerId,
            assertionId: replacement.id,
            effectiveTier: null,
            action: "block",
            reasonCode: "active_assertion",
          }),
        ]),
      );
    });

    await rotateAgentCredential(
      client.db,
      identity.organizationId,
      created.agent.id,
      { userId: identity.userId, requestId: `request-rotate-${suffix}` },
      {
        tokenPrefix: `rotated-${suffix}`,
        tokenHash: "fixture-rotated-hash",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    );
    await expect(resolveMachineCredential(client, `prefix-${suffix}`)).resolves.toBeNull();
    await expect(resolveMachineCredential(client, `rotated-${suffix}`)).resolves.toMatchObject({
      agentId: created.agent.id,
    });

    await expect(
      revokeAgent(client.db, identity.organizationId, created.agent.id, {
        userId: identity.userId,
        requestId: `request-revoke-${suffix}`,
      }),
    ).resolves.toBe(true);
    await expect(resolveMachineCredential(client, `rotated-${suffix}`)).resolves.toBeNull();
  });
});
