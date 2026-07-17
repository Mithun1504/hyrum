import { createHash } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Database } from "./index";
import {
  assertions,
  auditEvents,
  behaviorDefinitions,
  breakingChangePlans,
  gateExceptions,
  gateImpacts,
  outboxEvents,
  replayDeltas,
  replayRuns,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export class GateExceptionError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "GateExceptionError";
  }
}

export async function requestGateException(
  db: Database,
  organizationId: string,
  actor: { userId: string; membershipId: string; requestId: string; recentAuthAt: Date },
  gateImpactId: string,
  input: { reason: string; validUntil: Date },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    if (input.validUntil <= now || input.validUntil > new Date(now.getTime() + 7 * 86_400_000)) {
      throw new GateExceptionError(
        "invalid",
        "Exception validity must be within the next seven days",
      );
    }
    const [target] = await tx
      .select({
        apiServiceId: replayRuns.apiServiceId,
        breakingChangePlanId: breakingChangePlans.id,
        planStatus: breakingChangePlans.status,
        assertionExpiresAt: assertions.expiresAt,
        behaviorDefinitionId: assertions.behaviorDefinitionId,
        candidateImageDigest: replayRuns.candidateImageDigest,
        githubRepositoryId: replayRuns.githubRepositoryId,
        pullRequestId: replayRuns.pullRequestId,
      })
      .from(gateImpacts)
      .innerJoin(
        replayDeltas,
        and(
          eq(replayDeltas.organizationId, gateImpacts.organizationId),
          eq(replayDeltas.id, gateImpacts.replayDeltaId),
        ),
      )
      .innerJoin(
        replayRuns,
        and(
          eq(replayRuns.organizationId, replayDeltas.organizationId),
          eq(replayRuns.id, replayDeltas.replayRunId),
        ),
      )
      .innerJoin(
        assertions,
        and(
          eq(assertions.organizationId, gateImpacts.organizationId),
          eq(assertions.id, gateImpacts.assertionId),
        ),
      )
      .innerJoin(
        breakingChangePlans,
        and(
          eq(breakingChangePlans.organizationId, assertions.organizationId),
          eq(breakingChangePlans.assertionId, assertions.id),
        ),
      )
      .where(
        and(
          eq(gateImpacts.organizationId, organizationId),
          eq(gateImpacts.id, gateImpactId),
          eq(gateImpacts.action, "block"),
        ),
      )
      .limit(1);
    if (!target) {
      throw new GateExceptionError(
        "not_found",
        "A blocking assertion impact with a breaking-change plan is required",
      );
    }
    if (!["scheduled", "communication_ready"].includes(target.planStatus)) {
      throw new GateExceptionError(
        "invalid",
        "Breaking-change communication must be scheduled first",
      );
    }
    if (input.validUntil > target.assertionExpiresAt) {
      throw new GateExceptionError(
        "invalid",
        "Exception cannot outlive the compatibility assertion",
      );
    }
    const [exception] = await tx
      .insert(gateExceptions)
      .values({
        organizationId,
        apiServiceId: target.apiServiceId,
        breakingChangePlanId: target.breakingChangePlanId,
        behaviorDefinitionId: target.behaviorDefinitionId,
        githubRepositoryId: target.githubRepositoryId,
        pullRequestId: target.pullRequestId,
        candidateImageDigest: target.candidateImageDigest,
        reason: input.reason,
        requestedByMembershipId: actor.membershipId,
        recentAuthAt: actor.recentAuthAt,
        validFrom: now,
        validUntil: input.validUntil,
      })
      .returning({ id: gateExceptions.id });
    if (!exception) throw new GateExceptionError("conflict", "An exact exception already exists");
    const payload = { gateExceptionId: exception.id, gateImpactId, status: "pending" };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "gate_exception.requested",
        resourceType: "gate_exception",
        resourceId: exception.id,
        requestId: actor.requestId,
        changes: { gateImpactId, validUntil: input.validUntil.toISOString() },
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId,
        topic: "gate_exception.requested",
        aggregateType: "gate_exception",
        aggregateId: exception.id,
        eventVersion: 1,
        payload,
        payloadDigest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      }),
    ]);
    return { id: exception.id, apiServiceId: target.apiServiceId };
  });
}

export async function approveGateException(
  db: Database,
  organizationId: string,
  actor: { userId: string; membershipId: string; requestId: string },
  gateExceptionId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    const [existing] = await tx
      .select({
        requester: gateExceptions.requestedByMembershipId,
        apiServiceId: gateExceptions.apiServiceId,
      })
      .from(gateExceptions)
      .where(
        and(
          eq(gateExceptions.organizationId, organizationId),
          eq(gateExceptions.id, gateExceptionId),
          eq(gateExceptions.status, "pending"),
          gt(gateExceptions.validUntil, now),
        ),
      )
      .limit(1);
    if (!existing) throw new GateExceptionError("not_found", "Pending exception not found");
    if (existing.requester === actor.membershipId) {
      throw new GateExceptionError(
        "invalid",
        "Exception approval requires a different administrator",
      );
    }
    const [approved] = await tx
      .update(gateExceptions)
      .set({ status: "approved", approvedByMembershipId: actor.membershipId, approvedAt: now })
      .where(
        and(
          eq(gateExceptions.organizationId, organizationId),
          eq(gateExceptions.id, gateExceptionId),
          eq(gateExceptions.status, "pending"),
        ),
      )
      .returning({ id: gateExceptions.id });
    if (!approved) throw new GateExceptionError("conflict", "Exception status changed");
    const payload = { gateExceptionId, status: "approved" };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "gate_exception.approved",
        resourceType: "gate_exception",
        resourceId: gateExceptionId,
        requestId: actor.requestId,
        changes: {},
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId,
        topic: "gate_exception.approved",
        aggregateType: "gate_exception",
        aggregateId: gateExceptionId,
        eventVersion: 2,
        payload,
        payloadDigest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      }),
    ]);
    return { id: gateExceptionId, apiServiceId: existing.apiServiceId };
  });
}

export async function listGateExceptions(
  db: Database,
  organizationId: string,
  apiServiceId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) =>
    tx
      .select({
        id: gateExceptions.id,
        status: gateExceptions.status,
        behaviorLabel: behaviorDefinitions.defaultLabel,
        candidateImageDigest: gateExceptions.candidateImageDigest,
        reason: gateExceptions.reason,
        requestedByMembershipId: gateExceptions.requestedByMembershipId,
        approvedByMembershipId: gateExceptions.approvedByMembershipId,
        validFrom: gateExceptions.validFrom,
        validUntil: gateExceptions.validUntil,
        approvedAt: gateExceptions.approvedAt,
        usedAt: gateExceptions.usedAt,
        createdAt: gateExceptions.createdAt,
      })
      .from(gateExceptions)
      .innerJoin(
        behaviorDefinitions,
        and(
          eq(behaviorDefinitions.organizationId, gateExceptions.organizationId),
          eq(behaviorDefinitions.id, gateExceptions.behaviorDefinitionId),
        ),
      )
      .where(
        and(
          eq(gateExceptions.organizationId, organizationId),
          eq(gateExceptions.apiServiceId, apiServiceId),
        ),
      )
      .orderBy(desc(gateExceptions.createdAt)),
  );
}
