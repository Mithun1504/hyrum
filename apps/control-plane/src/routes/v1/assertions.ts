import {
  assertionSchema,
  type PinAssertionRequest,
  pinAssertionRequestSchema,
  progressEventTopic,
} from "@hyrum/contracts";
import {
  and,
  assertions,
  auditEvents,
  behaviorDefinitions,
  dependencyClaims,
  desc,
  eq,
  jobs,
  progressEvents,
  withTenant,
} from "@hyrum/db";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { asIso, requireContext } from "./helpers";

const assertionListSchema = z.object({ assertions: z.array(assertionSchema) });

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
          .select()
          .from(assertions)
          .where(eq(assertions.organizationId, context.organizationId))
          .orderBy(desc(assertions.expiresAt))
          .limit(100),
      );
      return {
        assertions: rows.map((row) => ({
          id: row.id,
          behavior_id: row.behaviorId,
          claim_id: row.claimId,
          owner_id: row.ownerId,
          reason: row.reason,
          status: row.status,
          expires_at: asIso(row.expiresAt),
        })),
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
          metadata: { behavior_id: request.body.behavior_id, claim_id: request.body.claim_id },
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
      return reply.code(201).send({
        id: assertion.id,
        behavior_id: assertion.behaviorId,
        claim_id: assertion.claimId,
        owner_id: assertion.ownerId,
        reason: assertion.reason,
        status: assertion.status,
        expires_at: asIso(assertion.expiresAt),
      });
    },
  );
};

import { randomUUID } from "node:crypto";
