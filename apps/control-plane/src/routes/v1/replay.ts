import {
  progressEventTopic,
  type ReplayReport,
  replayReportResponseSchema,
  replayReportSchema,
  replayRunDetailResponseSchema,
} from "@hyrum/contracts";
import {
  agents,
  and,
  assertions,
  behaviorDefinitions,
  captureSessions,
  dependencyClaims,
  desc,
  enqueueOutboxEvent,
  eq,
  gateDecisions,
  gatePolicies,
  githubRepositories,
  gt,
  inArray,
  progressEvents,
  receipts,
  replayAssertionResults,
  replayDeltas,
  replayRuns,
  slackChannels,
  sql,
  type TenantDb,
  withTenant,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  type ActiveReplayAssertion,
  type ActiveReplayClaim,
  type RecomputedReplayDecision,
  recomputeReplayDecision,
} from "../../domain/replay-decision";
import { sha256Hex, verifyEd25519Payload } from "../../domain/security";
import { requireContext } from "./helpers";

type ReplaySource = NonNullable<ReplayReport["source"]>;

export async function authorizeReplayIntegrations(
  tx: TenantDb,
  organizationId: string,
  source: ReplaySource,
  forbidden: (message: string) => Error,
): Promise<{ githubId?: string; slackId?: string }> {
  const [githubIntegration] = source.github
    ? await tx
        .select({ id: githubRepositories.id })
        .from(githubRepositories)
        .where(
          and(
            eq(githubRepositories.organizationId, organizationId),
            eq(githubRepositories.installationId, source.github.installation_id),
            eq(githubRepositories.owner, source.github.repository_owner),
            eq(githubRepositories.name, source.github.repository_name),
            eq(githubRepositories.active, true),
          ),
        )
        .limit(1)
    : [];
  if (source.github && !githubIntegration) {
    throw forbidden("GitHub replay source is not authorized for this organization");
  }

  const [slackIntegration] = source.slack
    ? await tx
        .select({ id: slackChannels.id })
        .from(slackChannels)
        .where(
          and(
            eq(slackChannels.organizationId, organizationId),
            eq(slackChannels.channelId, source.slack.channel),
            eq(slackChannels.active, true),
          ),
        )
        .limit(1)
    : [];
  if (source.slack && !slackIntegration) {
    throw forbidden("Slack replay source is not authorized for this organization");
  }

  return {
    ...(githubIntegration ? { githubId: githubIntegration.id } : {}),
    ...(slackIntegration ? { slackId: slackIntegration.id } : {}),
  };
}

export function replayDetailsUrl(webUrl: string, replayRunId: string) {
  return new URL(`/app/replay/${replayRunId}`, webUrl).toString();
}

export const replayRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/replay/reports",
    {
      preHandler: app.requireMachineScope("replay:write"),
      schema: {
        tags: ["replay"],
        security: [{ bearerAuth: [] }],
        body: replayReportSchema,
        response: { 201: replayReportResponseSchema },
      },
    },
    async (request, reply) => {
      const context = requireContext(app, request.authContext);
      if (request.body.organization_id !== context.organizationId) {
        throw app.httpErrors.forbidden("Report organization_id does not match credential tenant");
      }
      if (request.body.signature.key_id !== context.agentId) {
        throw app.httpErrors.forbidden("Report signature key_id does not match credential");
      }

      const [agent] = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select({ signingPublicKey: agents.signingPublicKey })
          .from(agents)
          .where(
            and(eq(agents.organizationId, context.organizationId), eq(agents.id, context.actorId)),
          )
          .limit(1),
      );
      if (!agent?.signingPublicKey)
        throw app.httpErrors.forbidden("Replay signing key is not registered");

      const { signature, ...unsignedReport } = request.body;
      const verified = verifyEd25519Payload(
        unsignedReport,
        signature.value,
        agent.signingPublicKey,
      );
      if (!verified) throw app.httpErrors.unauthorized("Replay report signature is invalid");

      const [policy] = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select()
          .from(gatePolicies)
          .where(
            and(
              eq(gatePolicies.organizationId, context.organizationId),
              eq(gatePolicies.id, request.body.policy_id),
              eq(gatePolicies.version, request.body.policy_version),
              eq(gatePolicies.active, true),
            ),
          )
          .limit(1),
      );
      if (!policy) {
        throw app.httpErrors.unprocessableEntity(
          "Replay report policy binding is not the active tenant policy",
        );
      }

      const claimIds = [
        ...new Set(
          request.body.results.flatMap((result) =>
            result.deltas.flatMap((delta) => delta.matches.map((match) => match.claim_id)),
          ),
        ),
      ];
      const claimsById = new Map<string, ActiveReplayClaim>();
      if (claimIds.length > 0) {
        const claims = await withTenant(app.database.db, context.organizationId, (tx) =>
          tx
            .select({
              id: dependencyClaims.id,
              organizationId: dependencyClaims.organizationId,
              behaviorId: dependencyClaims.behaviorId,
              behaviorKind: behaviorDefinitions.kind,
              behaviorPath: sql<string>`${behaviorDefinitions.fingerprint}->>'path'`,
              consumerId: dependencyClaims.consumerId,
              tier: dependencyClaims.tier,
              humanOverrideTier: dependencyClaims.humanOverrideTier,
              state: dependencyClaims.state,
              receiptId: dependencyClaims.receiptId,
              receiptOrganizationId: receipts.organizationId,
              receiptBehaviorId: receipts.behaviorId,
              receiptConsumerId: receipts.consumerId,
              receiptSessionId: receipts.captureSessionId,
              receiptSequenceStart: receipts.sequenceStart,
              receiptSequenceEnd: receipts.sequenceEnd,
              receiptExpiresAt: receipts.expiresAt,
              sessionOrganizationId: captureSessions.organizationId,
              sessionConsumerId: captureSessions.consumerId,
              sessionComplete: captureSessions.sessionComplete,
            })
            .from(dependencyClaims)
            .innerJoin(
              behaviorDefinitions,
              and(
                eq(behaviorDefinitions.organizationId, dependencyClaims.organizationId),
                eq(behaviorDefinitions.id, dependencyClaims.behaviorId),
              ),
            )
            .leftJoin(
              receipts,
              and(
                eq(receipts.organizationId, dependencyClaims.organizationId),
                eq(receipts.id, dependencyClaims.receiptId),
              ),
            )
            .leftJoin(
              captureSessions,
              and(
                eq(captureSessions.organizationId, receipts.organizationId),
                eq(captureSessions.id, receipts.captureSessionId),
              ),
            )
            .where(
              and(
                eq(dependencyClaims.organizationId, context.organizationId),
                inArray(dependencyClaims.id, claimIds),
              ),
            ),
        );
        for (const claim of claims) claimsById.set(claim.id, claim);
      }
      const assertionsById = new Map<string, ActiveReplayAssertion>();
      const activeAssertions = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select({
            id: assertions.id,
            organizationId: assertions.organizationId,
            behaviorId: assertions.behaviorId,
            claimId: assertions.claimId,
          })
          .from(assertions)
          .where(
            and(
              eq(assertions.organizationId, context.organizationId),
              eq(assertions.status, "active"),
              gt(assertions.expiresAt, new Date()),
            ),
          ),
      );
      for (const assertion of activeAssertions) assertionsById.set(assertion.id, assertion);
      let decision: RecomputedReplayDecision;
      try {
        decision = recomputeReplayDecision(
          request.body,
          context.organizationId,
          claimsById,
          assertionsById,
          {
            blockTiers: policy.blockTiers as ("T1" | "T2" | "T3")[],
            warnTiers: policy.warnTiers as ("T1" | "T2" | "T3")[],
          },
          new Date(),
        );
      } catch (error) {
        throw app.httpErrors.unprocessableEntity(
          error instanceof Error ? error.message : "Replay report matches are invalid",
        );
      }
      const reportDigest = sha256Hex(unsignedReport);
      const [run] = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [insertedRun] = await tx
          .insert(replayRuns)
          .values({
            organizationId: context.organizationId,
            reportVersion: request.body.version,
            baseUrl: request.body.base_url,
            candidateUrl: request.body.candidate_url,
            baseImageDigest: request.body.base_image_digest,
            candidateImageDigest: request.body.candidate_image_digest,
            extractorVersion: request.body.extractor_version,
            corpusDigest: request.body.corpus_digest,
            fixtureDigest: request.body.fixture_digest,
            maskDigest: request.body.mask_digest,
            runnerVersion: request.body.runner_version,
            policyId: policy.id,
            policyVersion: policy.version,
            runs: request.body.runs,
            outcome: decision.outcome,
            reportDigest,
            signatureKeyId: signature.key_id,
            signatureVerified: true,
            generatedAt: new Date(request.body.generated_at),
          })
          .onConflictDoNothing({
            target: [replayRuns.organizationId, replayRuns.reportDigest],
          })
          .returning();

        const [replayRun] =
          insertedRun === undefined
            ? await tx
                .select()
                .from(replayRuns)
                .where(
                  and(
                    eq(replayRuns.organizationId, context.organizationId),
                    eq(replayRuns.reportDigest, reportDigest),
                  ),
                )
                .limit(1)
            : [insertedRun];
        if (!replayRun) throw new Error("Failed to store replay run");
        if (!insertedRun) return [replayRun];

        for (const result of request.body.results) {
          for (const delta of result.deltas) {
            await tx
              .insert(replayDeltas)
              .values({
                organizationId: context.organizationId,
                replayRunId: replayRun.id,
                caseId: result.case_id,
                kind: delta.kind,
                path: delta.path,
                digest: delta.digest,
                stable: result.stable,
                quarantined: result.quarantined,
                before: delta.before,
                after: delta.after,
                matches: delta.matches,
              })
              .onConflictDoNothing({
                target: [
                  replayDeltas.organizationId,
                  replayDeltas.replayRunId,
                  replayDeltas.caseId,
                  replayDeltas.kind,
                  replayDeltas.path,
                  replayDeltas.digest,
                ],
              });
          }
        }

        if (request.body.assertion_results.length > 0) {
          await tx
            .insert(replayAssertionResults)
            .values(
              request.body.assertion_results.map((result) => ({
                organizationId: context.organizationId,
                replayRunId: replayRun.id,
                assertionId: result.assertion_id,
                behaviorId: result.behavior_id,
                claimId: result.claim_id,
                caseId: result.case_id,
                outcome: result.outcome,
              })),
            )
            .onConflictDoNothing({
              target: [
                replayAssertionResults.organizationId,
                replayAssertionResults.replayRunId,
                replayAssertionResults.assertionId,
              ],
            });
        }

        await tx
          .insert(gateDecisions)
          .values({
            organizationId: context.organizationId,
            replayRunId: replayRun.id,
            policyId: policy.id,
            outcome: decision.outcome,
            blockCount: decision.block_count,
            warnCount: decision.warn_count,
            noteCount: decision.note_count,
            reasons: decision.reasons,
          })
          .onConflictDoNothing({
            target: [gateDecisions.organizationId, gateDecisions.replayRunId],
          });

        await tx.insert(progressEvents).values({
          organizationId: context.organizationId,
          topic: progressEventTopic.replayReportIngested,
          resourceId: replayRun.id,
          payload: {
            outcome: decision.outcome,
            block_count: decision.block_count,
            warn_count: decision.warn_count,
          },
        });
        if (request.body.source) {
          const githubSource = request.body.source.github;
          const slackSource = request.body.source.slack;
          const integrations = await authorizeReplayIntegrations(
            tx,
            context.organizationId,
            request.body.source,
            (message) => app.httpErrors.forbidden(message),
          );
          await enqueueOutboxEvent(tx, {
            organizationId: context.organizationId,
            topic: "integration.gate_decided",
            idempotencyKey: `gate:${reportDigest}`,
            payload: {
              reportId: replayRun.id,
              detailsUrl: replayDetailsUrl(app.webUrl, replayRun.id),
              decision: {
                outcome: decision.outcome,
                blockCount: decision.block_count,
                warnCount: decision.warn_count,
                noteCount: decision.note_count,
                reasons: decision.reasons,
              },
              ...(githubSource && integrations.githubId
                ? {
                    github: {
                      integrationId: integrations.githubId,
                      headSha: githubSource.head_sha,
                      pullRequest: githubSource.pull_request,
                    },
                  }
                : {}),
              ...(slackSource && integrations.slackId
                ? { slack: { integrationId: integrations.slackId } }
                : {}),
            },
          });
        }
        return [replayRun];
      });

      if (!run) throw new Error("Failed to store replay report");
      return reply.code(201).send({
        replay_run_id: run.id,
        verified,
        outcome: run.outcome,
      });
    },
  );

  async function getReplayRun(organizationId: string, id?: string) {
    return withTenant(app.database.db, organizationId, async (tx) => {
      const [run] = await tx
        .select({
          run: replayRuns,
          decision: gateDecisions,
        })
        .from(replayRuns)
        .innerJoin(gateDecisions, eq(gateDecisions.replayRunId, replayRuns.id))
        .where(
          id
            ? and(eq(replayRuns.organizationId, organizationId), eq(replayRuns.id, id))
            : eq(replayRuns.organizationId, organizationId),
        )
        .orderBy(desc(replayRuns.createdAt))
        .limit(1);
      if (!run) return undefined;
      const deltas = await tx
        .select()
        .from(replayDeltas)
        .where(eq(replayDeltas.replayRunId, run.run.id))
        .orderBy(desc(replayDeltas.createdAt));
      const assertionResults = await tx
        .select()
        .from(replayAssertionResults)
        .where(eq(replayAssertionResults.replayRunId, run.run.id))
        .orderBy(desc(replayAssertionResults.createdAt));
      return replayRunDetailResponseSchema.parse({
        id: run.run.id,
        generated_at: run.run.generatedAt.toISOString(),
        base_url: run.run.baseUrl,
        candidate_url: run.run.candidateUrl,
        base_image_digest: run.run.baseImageDigest,
        candidate_image_digest: run.run.candidateImageDigest,
        extractor_version: run.run.extractorVersion,
        corpus_digest: run.run.corpusDigest,
        fixture_digest: run.run.fixtureDigest,
        mask_digest: run.run.maskDigest,
        runner_version: run.run.runnerVersion,
        policy_id: run.run.policyId,
        policy_version: run.run.policyVersion,
        runs: run.run.runs,
        outcome: run.decision.outcome,
        decision: {
          outcome: run.decision.outcome,
          block_count: run.decision.blockCount,
          warn_count: run.decision.warnCount,
          note_count: run.decision.noteCount,
          reasons: run.decision.reasons,
        },
        deltas: deltas.map((delta) => ({
          case_id: delta.caseId,
          kind: delta.kind,
          path: delta.path,
          digest: delta.digest,
          stable: delta.stable,
          quarantined: delta.quarantined,
          before: delta.before,
          after: delta.after,
          matches: delta.matches,
        })),
        assertion_results: assertionResults.map((result) => ({
          assertion_id: result.assertionId,
          behavior_id: result.behaviorId,
          claim_id: result.claimId,
          case_id: result.caseId,
          outcome: result.outcome,
        })),
      });
    });
  }

  app.get(
    "/replay/runs/latest",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["replay"],
        security: [{ bearerAuth: [] }],
        response: { 200: replayRunDetailResponseSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const run = await getReplayRun(context.organizationId);
      if (!run) throw app.httpErrors.notFound();
      return run;
    },
  );

  app.get(
    "/replay/runs/:id",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["replay"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        response: { 200: replayRunDetailResponseSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const run = await getReplayRun(context.organizationId, request.params.id);
      if (!run) throw app.httpErrors.notFound();
      return run;
    },
  );
};
