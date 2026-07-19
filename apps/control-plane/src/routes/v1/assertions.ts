import { randomUUID } from "node:crypto";
import {
  assertionListItemSchema,
  assertionSchema,
  type PinAssertionRequest,
  pinAssertionRequestSchema,
  progressEventTopic,
  resolveAssertionRequestSchema,
} from "@hyrum/contracts";
import {
  and,
  assertions,
  auditEvents,
  behaviorDefinitions,
  consumers,
  dependencyClaims,
  desc,
  eq,
  jobs,
  ledgerEntries,
  llmRuns,
  operations,
  progressEvents,
  receiptIsUnexpired,
  receipts,
  users,
  withTenant,
} from "@hyrum/db";
import { draftCustomerNotice } from "@hyrum/openai";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { sha256Hex } from "../../domain/security";
import { asIso, requireContext } from "./helpers";

const assertionListSchema = z.object({ assertions: z.array(assertionListItemSchema) });
const assertionParamsSchema = z.object({ id: z.uuid() });

function serializeAssertion(row: typeof assertions.$inferSelect) {
  return assertionSchema.parse({
    id: row.id,
    behavior_id: row.behaviorId,
    claim_id: row.claimId,
    owner_id: row.ownerId,
    reason: row.reason,
    status: row.status,
    expires_at: asIso(row.expiresAt),
    resolution_type: row.resolutionType,
    resolution_reason: row.resolutionReason,
    resolved_by: row.resolvedBy,
    resolved_at: row.resolvedAt ? asIso(row.resolvedAt) : null,
    customer_notice: row.customerNotice,
  });
}

function serializeAssertionListItem(row: {
  assertion: typeof assertions.$inferSelect;
  ownerName: string | null;
  ownerEmail: string | null;
  behaviorLabel: string | null;
  behaviorKind: (typeof behaviorDefinitions.$inferSelect)["kind"];
}) {
  return assertionListItemSchema.parse({
    ...serializeAssertion(row.assertion),
    owner_name: row.ownerName ?? row.ownerEmail ?? "Former member",
    behavior_title: row.behaviorLabel ?? `Unlabeled ${row.behaviorKind} behavior`,
  });
}

function defaultExpiry(body: PinAssertionRequest) {
  if (body.expires_at) return new Date(body.expires_at);
  return new Date(Date.now() + 90 * 86_400_000);
}

export const assertionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/assertions",
    {
      preHandler: app.requireHumanPermission("ledger:read"),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        response: { 200: assertionListSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const rows = await withTenant(app.database.db, context.organizationId, (tx) =>
        tx
          .select({
            assertion: assertions,
            ownerName: users.displayName,
            ownerEmail: users.email,
            behaviorLabel: behaviorDefinitions.label,
            behaviorKind: behaviorDefinitions.kind,
          })
          .from(assertions)
          .leftJoin(users, eq(users.id, assertions.ownerId))
          .innerJoin(
            behaviorDefinitions,
            and(
              eq(behaviorDefinitions.organizationId, assertions.organizationId),
              eq(behaviorDefinitions.id, assertions.behaviorId),
            ),
          )
          .where(eq(assertions.organizationId, context.organizationId))
          .orderBy(desc(assertions.expiresAt))
          .limit(100),
      );
      return {
        assertions: rows.map(serializeAssertionListItem),
      };
    },
  );

  app.post(
    "/assertions",
    {
      preHandler: app.requireHumanPermission("assertion:pin"),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        body: pinAssertionRequestSchema,
        response: { 201: assertionSchema },
      },
    },
    async (request, reply) => {
      const context = requireContext(app, request.authContext);
      const expiresAt = defaultExpiry(request.body);
      if (expiresAt <= new Date())
        throw app.httpErrors.badRequest("expires_at must be in the future");
      const assertion = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [behavior] = await tx
          .select({ id: behaviorDefinitions.id })
          .from(behaviorDefinitions)
          .where(
            and(
              eq(behaviorDefinitions.organizationId, context.organizationId),
              eq(behaviorDefinitions.id, request.body.behavior_id),
            ),
          )
          .limit(1);
        if (!behavior) throw app.httpErrors.notFound("Behavior not found");

        if (request.body.claim_id) {
          const [claim] = await tx
            .select({ id: dependencyClaims.id })
            .from(dependencyClaims)
            .where(
              and(
                eq(dependencyClaims.organizationId, context.organizationId),
                eq(dependencyClaims.id, request.body.claim_id),
                eq(dependencyClaims.behaviorId, request.body.behavior_id),
              ),
            )
            .limit(1);
          if (!claim) throw app.httpErrors.notFound("Claim not found for behavior");
        }

        const assertionId = randomUUID();
        const [row] = await tx
          .insert(assertions)
          .values({
            id: assertionId,
            organizationId: context.organizationId,
            behaviorId: request.body.behavior_id,
            claimId: request.body.claim_id,
            ownerId: context.actorId,
            reason: request.body.reason,
            policy: request.body.policy ?? {},
            expiresAt,
          })
          .returning();
        await tx.insert(jobs).values({
          organizationId: context.organizationId,
          type: "assertions.expire",
          payload: { assertion_id: assertionId },
          runAfter: expiresAt,
          idempotencyKey: `assertion-expire:${assertionId}`,
        });
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: "assertion.pin",
          resourceType: "assertion",
          resourceId: row?.id,
          metadata: {
            behavior_id: request.body.behavior_id,
            claim_id: request.body.claim_id,
          },
        });
        await tx.insert(progressEvents).values({
          organizationId: context.organizationId,
          topic: progressEventTopic.assertionPinned,
          resourceId: row?.id,
          payload: { behavior_id: request.body.behavior_id },
        });
        return row;
      });
      if (!assertion) throw new Error("Failed to pin assertion");
      return reply.code(201).send(serializeAssertion(assertion));
    },
  );

  app.post(
    "/assertions/:id/resolve",
    {
      preHandler: app.requireHumanPermission("assertion:pin"),
      schema: {
        tags: ["assertions"],
        security: [{ bearerAuth: [] }],
        params: assertionParamsSchema,
        body: resolveAssertionRequestSchema,
        response: { 200: assertionSchema },
      },
    },
    async (request) => {
      const context = requireContext(app, request.authContext);
      const now = new Date();
      const body = request.body;
      let assertion = await withTenant(app.database.db, context.organizationId, async (tx) => {
        const [current] = await tx
          .select()
          .from(assertions)
          .where(
            and(
              eq(assertions.organizationId, context.organizationId),
              eq(assertions.id, request.params.id),
            ),
          )
          .limit(1)
          .for("update");
        if (!current) throw app.httpErrors.notFound("Assertion not found");
        if (current.status === "resolved") {
          throw app.httpErrors.conflict("Assertion is already resolved");
        }
        if (current.status === "active" && current.resolutionType === "scheduled_break") {
          throw app.httpErrors.conflict("A deliberate break is already scheduled");
        }

        const isExtension = body.resolution === "extend";
        const isScheduledBreak = body.resolution === "schedule_break";
        const resolutionType =
          body.resolution === "documented"
            ? "documented"
            : body.resolution === "schedule_break"
              ? "scheduled_break"
              : "extended";
        const expiresAt =
          body.resolution === "extend"
            ? new Date(body.expires_at)
            : body.resolution === "schedule_break"
              ? new Date(body.break_at)
              : current.expiresAt;
        if (body.resolution !== "documented" && expiresAt.getTime() <= now.getTime()) {
          throw app.httpErrors.badRequest("The new expiry or break date must be in the future");
        }
        const customerNotice =
          body.resolution === "schedule_break"
            ? {
                subject: `Planned compatibility change: ${current.reason}`.slice(0, 160),
                summary: `This accidental contract is scheduled to change on ${expiresAt.toISOString()}.`,
                body: `We identified consumers using this behavior and will change it on ${expiresAt.toISOString()}. ${body.reason}`,
                effective_at: expiresAt.toISOString(),
                impacted_consumers: [],
              }
            : null;
        const [updated] = await tx
          .update(assertions)
          .set({
            status: isExtension || isScheduledBreak ? "active" : "resolved",
            expiresAt,
            resolutionType,
            resolutionReason: body.reason,
            resolvedBy: context.actorId,
            resolvedAt: now,
            customerNotice,
            updatedAt: now,
          })
          .where(
            and(
              eq(assertions.organizationId, context.organizationId),
              eq(assertions.id, current.id),
            ),
          )
          .returning();
        if (!updated) throw new Error("Failed to resolve assertion");

        if (isExtension || isScheduledBreak) {
          await tx
            .insert(jobs)
            .values({
              organizationId: context.organizationId,
              type: "assertions.expire",
              payload: { assertion_id: updated.id },
              runAfter: expiresAt,
              idempotencyKey: `assertion-expire:${updated.id}:${expiresAt.toISOString()}`,
            })
            .onConflictDoNothing();
        }
        await tx.insert(auditEvents).values({
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: `assertion.${body.resolution}`,
          resourceType: "assertion",
          resourceId: updated.id,
          metadata: {
            reason: body.reason,
            expires_at: expiresAt.toISOString(),
          },
        });
        return updated;
      });
      if (body.resolution === "schedule_break") {
        const evidence = await withTenant(app.database.db, context.organizationId, async (tx) => {
          return tx
            .select({
              receiptId: receipts.id,
              excerpt: receipts.excerpt,
              consumerId: consumers.id,
              displayAlias: consumers.displayAlias,
              tier: dependencyClaims.tier,
              overrideTier: dependencyClaims.humanOverrideTier,
              evidence: dependencyClaims.evidence,
              method: operations.method,
              pathTemplate: operations.pathTemplate,
            })
            .from(dependencyClaims)
            .innerJoin(
              consumers,
              and(
                eq(consumers.organizationId, dependencyClaims.organizationId),
                eq(consumers.id, dependencyClaims.consumerId),
              ),
            )
            .leftJoin(
              ledgerEntries,
              and(
                eq(ledgerEntries.organizationId, dependencyClaims.organizationId),
                eq(ledgerEntries.claimId, dependencyClaims.id),
              ),
            )
            .leftJoin(
              operations,
              and(
                eq(operations.organizationId, dependencyClaims.organizationId),
                eq(operations.id, ledgerEntries.operationId),
              ),
            )
            .innerJoin(
              receipts,
              and(
                eq(receipts.organizationId, dependencyClaims.organizationId),
                eq(receipts.id, dependencyClaims.receiptId),
                receiptIsUnexpired(),
              ),
            )
            .where(
              and(
                eq(dependencyClaims.organizationId, context.organizationId),
                eq(dependencyClaims.behaviorId, assertion.behaviorId),
              ),
            );
        });
        const impactedConsumers = evidence.map((row) => {
          const details = row.evidence as { observation_count?: unknown };
          const endpoint =
            row.method && row.pathTemplate ? `${row.method} ${row.pathTemplate}` : null;
          return {
            consumer_id: row.consumerId,
            display_alias: row.displayAlias,
            tier: row.overrideTier ?? row.tier,
            endpoints: endpoint ? [endpoint] : [],
            observation_count:
              typeof details.observation_count === "number" &&
              Number.isInteger(details.observation_count) &&
              details.observation_count >= 0
                ? details.observation_count
                : null,
          };
        });
        const deterministicNotice = {
          ...(assertion.customerNotice as {
            subject: string;
            summary: string;
            body: string;
            effective_at: string;
          }),
          impacted_consumers: impactedConsumers,
        };
        assertion = await withTenant(app.database.db, context.organizationId, async (tx) => {
          const [updated] = await tx
            .update(assertions)
            .set({
              customerNotice: deterministicNotice,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(assertions.organizationId, context.organizationId),
                eq(assertions.id, assertion.id),
              ),
            )
            .returning();
          return updated ?? assertion;
        });
        if (evidence.length > 0) {
          try {
            const receiptIds = [...new Set(evidence.map((row) => row.receiptId))];
            const generated = await draftCustomerNotice({
              receiptIds,
              redactedEvidence: evidence.map((row) => row.excerpt),
              change: {
                assertionId: assertion.id,
                behaviorId: assertion.behaviorId,
                impactedConsumers,
              },
              effectiveAt: new Date(body.break_at).toISOString(),
            });
            assertion = await withTenant(app.database.db, context.organizationId, async (tx) => {
              const notice = {
                subject: generated.result.subject,
                summary: generated.result.summary,
                body: generated.result.body,
                effective_at: generated.result.effectiveAt,
                impacted_consumers: impactedConsumers,
              };
              const [updated] = await tx
                .update(assertions)
                .set({ customerNotice: notice, updatedAt: new Date() })
                .where(
                  and(
                    eq(assertions.organizationId, context.organizationId),
                    eq(assertions.id, assertion.id),
                  ),
                )
                .returning();
              await tx.insert(llmRuns).values({
                organizationId: context.organizationId,
                task: "customer.notice",
                model: generated.model,
                promptVersion: generated.promptVersion,
                schemaVersion: "hyrum_customer_notice_v1",
                responseId: generated.responseId,
                status: "completed",
                inputDigest: sha256Hex({
                  assertion_id: assertion.id,
                  receipt_ids: receiptIds,
                }),
                resultDigest: sha256Hex(notice),
                tokenUsage: generated.tokenUsage ?? null,
                result: notice,
              });
              return updated ?? assertion;
            });
          } catch (error) {
            request.log.warn(
              {
                err:
                  error instanceof Error ? { name: error.name, message: error.message } : undefined,
              },
              "customer notice model assistance unavailable; deterministic notice retained",
            );
          }
        }
      }
      return serializeAssertion(assertion);
    },
  );
};
