import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  assertionConsumers,
  assertionEvents,
  assertions,
  auditEvents,
  behaviorDefinitions,
  breakingChangeImpacts,
  breakingChangePlans,
  claimEvidence,
  consumers,
  dependencyClaims,
  generatedDrafts,
  jobs,
  ledgerEntries,
  memberships,
  outboxEvents,
  users,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export class AssertionDomainError extends Error {
  constructor(
    public readonly code: "not_found" | "conflict" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "AssertionDomainError";
  }
}

interface AssertionActor {
  userId: string;
  membershipId: string;
  requestId: string;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function appendDomainEvent(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  organizationId: string,
  aggregateId: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const [existing] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, organizationId),
        eq(outboxEvents.aggregateType, "assertion"),
        eq(outboxEvents.aggregateId, aggregateId),
      ),
    );
  await tx.insert(outboxEvents).values({
    organizationId,
    topic,
    aggregateType: "assertion",
    aggregateId,
    eventVersion: (existing?.count ?? 0) + 1,
    payload,
    payloadDigest: digest(payload),
  });
}

async function assertOwner(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  organizationId: string,
  membershipId: string,
): Promise<void> {
  const [owner] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.id, membershipId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);
  if (!owner) throw new AssertionDomainError("invalid", "Assertion owner must be an active member");
}

export async function listAssertions(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  status?: "active" | "expiring" | "expired" | "resolved" | "cancelled",
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const conditions = [
      eq(assertions.organizationId, organizationId),
      eq(assertions.apiServiceId, apiServiceId),
    ];
    if (status) conditions.push(eq(assertions.status, status));
    const rows = await tx
      .select({
        id: assertions.id,
        apiServiceId: assertions.apiServiceId,
        behaviorId: behaviorDefinitions.id,
        behaviorLabel: behaviorDefinitions.defaultLabel,
        behaviorKind: behaviorDefinitions.kind,
        sourceClaimId: assertions.sourceClaimId,
        ownerMembershipId: memberships.id,
        ownerDisplayName: users.displayName,
        ownerEmail: users.primaryEmail,
        reason: assertions.reason,
        status: assertions.status,
        scope: assertions.scope,
        startsAt: assertions.startsAt,
        expiresAt: assertions.expiresAt,
        remindAt: assertions.remindAt,
        resolution: assertions.resolution,
        supersedesAssertionId: assertions.supersedesAssertionId,
        updatedAt: assertions.updatedAt,
      })
      .from(assertions)
      .innerJoin(
        behaviorDefinitions,
        and(
          eq(behaviorDefinitions.organizationId, assertions.organizationId),
          eq(behaviorDefinitions.id, assertions.behaviorDefinitionId),
        ),
      )
      .innerJoin(
        memberships,
        and(
          eq(memberships.organizationId, assertions.organizationId),
          eq(memberships.id, assertions.ownerMembershipId),
        ),
      )
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(...conditions))
      .orderBy(desc(assertions.createdAt));
    const ids = rows.map((row) => row.id);
    const scoped = ids.length
      ? await tx
          .select({
            assertionId: assertionConsumers.assertionId,
            consumerId: assertionConsumers.consumerId,
          })
          .from(assertionConsumers)
          .where(
            and(
              eq(assertionConsumers.organizationId, organizationId),
              inArray(assertionConsumers.assertionId, ids),
            ),
          )
      : [];
    const consumersByAssertion = new Map<string, string[]>();
    for (const item of scoped) {
      const values = consumersByAssertion.get(item.assertionId) ?? [];
      values.push(item.consumerId);
      consumersByAssertion.set(item.assertionId, values);
    }
    const plans = ids.length
      ? await tx
          .select({
            id: breakingChangePlans.id,
            assertionId: breakingChangePlans.assertionId,
            status: breakingChangePlans.status,
            plannedFor: breakingChangePlans.plannedFor,
            communicationDueAt: breakingChangePlans.communicationDueAt,
          })
          .from(breakingChangePlans)
          .where(
            and(
              eq(breakingChangePlans.organizationId, organizationId),
              inArray(breakingChangePlans.assertionId, ids),
            ),
          )
      : [];
    const plansByAssertion = new Map(plans.map((plan) => [plan.assertionId, plan]));
    return rows.map((row) => ({
      id: row.id,
      apiServiceId: row.apiServiceId,
      behavior: { id: row.behaviorId, label: row.behaviorLabel, kind: row.behaviorKind },
      sourceClaimId: row.sourceClaimId,
      owner: {
        membershipId: row.ownerMembershipId,
        displayName: row.ownerDisplayName ?? row.ownerEmail,
        email: row.ownerEmail,
      },
      reason: row.reason,
      status: row.status,
      scope: row.scope,
      consumerIds: consumersByAssertion.get(row.id) ?? [],
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      remindAt: row.remindAt,
      resolution: row.resolution,
      supersedesAssertionId: row.supersedesAssertionId,
      breakingChangePlan: plansByAssertion.get(row.id) ?? null,
      updatedAt: row.updatedAt,
    }));
  });
}

export async function getAssertion(db: Database, organizationId: string, assertionId: string) {
  const apiServiceId = await withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({ apiServiceId: assertions.apiServiceId })
      .from(assertions)
      .where(and(eq(assertions.organizationId, organizationId), eq(assertions.id, assertionId)))
      .limit(1);
    return row?.apiServiceId ?? null;
  });
  if (!apiServiceId) return null;
  return (
    (await listAssertions(db, organizationId, apiServiceId)).find(
      (assertion) => assertion.id === assertionId,
    ) ?? null
  );
}

export async function createAssertion(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  actor: AssertionActor,
  input: {
    behaviorDefinitionId: string;
    sourceClaimId?: string;
    ownerMembershipId: string;
    reason: string;
    scope: "all_consumers" | "selected_consumers";
    consumerIds: string[];
    expiresAt: Date;
    remindAt?: Date;
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    if (input.expiresAt <= now)
      throw new AssertionDomainError("invalid", "Expiry must be in the future");
    const remindAt =
      input.remindAt ??
      new Date(Math.max(now.getTime(), input.expiresAt.getTime() - 7 * 86_400_000));
    if (remindAt < now || remindAt > input.expiresAt) {
      throw new AssertionDomainError("invalid", "Reminder must fall inside the assertion window");
    }
    await assertOwner(tx, organizationId, input.ownerMembershipId);
    const [behavior] = await tx
      .select({ id: behaviorDefinitions.id })
      .from(behaviorDefinitions)
      .where(
        and(
          eq(behaviorDefinitions.organizationId, organizationId),
          eq(behaviorDefinitions.apiServiceId, apiServiceId),
          eq(behaviorDefinitions.id, input.behaviorDefinitionId),
        ),
      )
      .limit(1);
    if (!behavior) throw new AssertionDomainError("not_found", "Behavior was not found");
    if (input.sourceClaimId) {
      const [claim] = await tx
        .select({ id: dependencyClaims.id })
        .from(dependencyClaims)
        .where(
          and(
            eq(dependencyClaims.organizationId, organizationId),
            eq(dependencyClaims.apiServiceId, apiServiceId),
            eq(dependencyClaims.behaviorDefinitionId, input.behaviorDefinitionId),
            eq(dependencyClaims.id, input.sourceClaimId),
            eq(dependencyClaims.status, "active"),
          ),
        )
        .limit(1);
      if (!claim)
        throw new AssertionDomainError("invalid", "Source claim is not active for this behavior");
    }
    const [duplicate] = await tx
      .select({ id: assertions.id })
      .from(assertions)
      .where(
        and(
          eq(assertions.organizationId, organizationId),
          eq(assertions.apiServiceId, apiServiceId),
          eq(assertions.behaviorDefinitionId, input.behaviorDefinitionId),
          inArray(assertions.status, ["active", "expiring"]),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new AssertionDomainError(
        "conflict",
        "An active assertion already covers this behavior",
      );
    }
    if (input.scope === "selected_consumers") {
      const selected = await tx
        .select({ id: consumers.id })
        .from(consumers)
        .where(
          and(
            eq(consumers.organizationId, organizationId),
            eq(consumers.apiServiceId, apiServiceId),
            inArray(consumers.id, input.consumerIds),
            isNull(consumers.deletedAt),
          ),
        );
      if (selected.length !== input.consumerIds.length) {
        throw new AssertionDomainError(
          "invalid",
          "Every selected consumer must belong to this service",
        );
      }
    }
    const [created] = await tx
      .insert(assertions)
      .values({
        organizationId,
        apiServiceId,
        behaviorDefinitionId: input.behaviorDefinitionId,
        sourceClaimId: input.sourceClaimId,
        ownerMembershipId: input.ownerMembershipId,
        reason: input.reason,
        scope: input.scope,
        startsAt: now,
        expiresAt: input.expiresAt,
        remindAt,
      })
      .returning({ id: assertions.id, updatedAt: assertions.updatedAt });
    if (!created) throw new Error("Assertion creation returned no record");
    if (input.consumerIds.length) {
      await tx.insert(assertionConsumers).values(
        input.consumerIds.map((consumerId) => ({
          organizationId,
          assertionId: created.id,
          consumerId,
        })),
      );
    }
    await tx.insert(assertionEvents).values({
      organizationId,
      assertionId: created.id,
      eventType: "pinned",
      actorType: "user",
      actorId: actor.userId,
      reason: input.reason,
      newExpiry: input.expiresAt,
      metadata: { scope: input.scope, consumerCount: input.consumerIds.length },
    });
    const payload = {
      assertionId: created.id,
      apiServiceId,
      behaviorDefinitionId: input.behaviorDefinitionId,
    };
    await Promise.all([
      tx.insert(jobs).values({
        organizationId,
        type: "remind_assertion_expiry",
        payload: { assertionId: created.id },
        runAfter: remindAt,
        idempotencyKey: `assertion-reminder:${created.id}:${remindAt.toISOString()}`,
        concurrencyKey: `assertion:${created.id}`,
      }),
      tx.insert(jobs).values({
        organizationId,
        type: "expire_assertion",
        payload: { assertionId: created.id },
        runAfter: input.expiresAt,
        idempotencyKey: `assertion-expiry:${created.id}:${input.expiresAt.toISOString()}`,
        concurrencyKey: `assertion:${created.id}`,
      }),
      tx.insert(jobs).values({
        organizationId,
        type: "build_replay_corpus",
        payload: { apiServiceId, reason: "assertion_pinned", assertionId: created.id },
        idempotencyKey: `assertion-corpus:${created.id}:pinned`,
        concurrencyKey: `corpus:${apiServiceId}`,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "assertion.pinned",
        resourceType: "assertion",
        resourceId: created.id,
        requestId: actor.requestId,
        changes: payload,
        outcome: "succeeded",
      }),
      appendDomainEvent(tx, organizationId, created.id, "assertion.pinned", payload),
    ]);
    return created;
  });
}

export async function extendAssertion(
  db: Database,
  organizationId: string,
  assertionId: string,
  actor: AssertionActor,
  input: { expiresAt: Date; remindAt?: Date; reason: string; expectedUpdatedAt: Date },
): Promise<{ id: string; apiServiceId: string; updatedAt: Date }> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.execute(
      sql`select id from assertions where organization_id = ${organizationId} and id = ${assertionId} for update`,
    );
    const [current] = await tx
      .select()
      .from(assertions)
      .where(and(eq(assertions.organizationId, organizationId), eq(assertions.id, assertionId)))
      .limit(1);
    if (!current) throw new AssertionDomainError("not_found", "Assertion was not found");
    if (!(["active", "expiring"] as const).includes(current.status as "active" | "expiring")) {
      throw new AssertionDomainError("conflict", "Only active assertions can be extended");
    }
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new AssertionDomainError("conflict", "Assertion changed; refresh before extending");
    }
    if (input.expiresAt <= current.expiresAt) {
      throw new AssertionDomainError(
        "invalid",
        "Extension expiry must be later than the current expiry",
      );
    }
    const now = new Date();
    const remindAt = input.remindAt ?? new Date(input.expiresAt.getTime() - 7 * 86_400_000);
    if (remindAt < now || remindAt > input.expiresAt) {
      throw new AssertionDomainError(
        "invalid",
        "Reminder must fall inside the new assertion window",
      );
    }
    const selected = await tx
      .select({ consumerId: assertionConsumers.consumerId })
      .from(assertionConsumers)
      .where(
        and(
          eq(assertionConsumers.organizationId, organizationId),
          eq(assertionConsumers.assertionId, assertionId),
        ),
      );
    await tx
      .update(assertions)
      .set({
        status: "resolved",
        resolution: "extended",
        resolvedAt: now,
        resolvedByMembershipId: actor.membershipId,
        updatedAt: now,
      })
      .where(eq(assertions.id, assertionId));
    await tx
      .update(jobs)
      .set({ status: "cancelled", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(jobs.organizationId, organizationId),
          eq(jobs.concurrencyKey, `assertion:${assertionId}`),
          eq(jobs.status, "pending"),
        ),
      );
    const [replacement] = await tx
      .insert(assertions)
      .values({
        organizationId,
        apiServiceId: current.apiServiceId,
        behaviorDefinitionId: current.behaviorDefinitionId,
        sourceClaimId: current.sourceClaimId,
        ownerMembershipId: current.ownerMembershipId,
        reason: current.reason,
        scope: current.scope,
        startsAt: now,
        expiresAt: input.expiresAt,
        remindAt,
        supersedesAssertionId: current.id,
      })
      .returning({
        id: assertions.id,
        apiServiceId: assertions.apiServiceId,
        updatedAt: assertions.updatedAt,
      });
    if (!replacement) throw new Error("Assertion extension returned no replacement");
    if (selected.length) {
      await tx.insert(assertionConsumers).values(
        selected.map(({ consumerId }) => ({
          organizationId,
          assertionId: replacement.id,
          consumerId,
        })),
      );
    }
    await Promise.all([
      tx.insert(assertionEvents).values({
        organizationId,
        assertionId: current.id,
        eventType: "extended",
        actorType: "user",
        actorId: actor.userId,
        reason: input.reason,
        previousExpiry: current.expiresAt,
        newExpiry: input.expiresAt,
        metadata: { replacementAssertionId: replacement.id },
      }),
      tx.insert(assertionEvents).values({
        organizationId,
        assertionId: replacement.id,
        eventType: "pinned",
        actorType: "user",
        actorId: actor.userId,
        reason: input.reason,
        newExpiry: input.expiresAt,
        metadata: { supersedesAssertionId: current.id },
      }),
      tx.insert(jobs).values({
        organizationId,
        type: "remind_assertion_expiry",
        payload: { assertionId: replacement.id },
        runAfter: remindAt,
        idempotencyKey: `assertion-reminder:${replacement.id}:${remindAt.toISOString()}`,
        concurrencyKey: `assertion:${replacement.id}`,
      }),
      tx.insert(jobs).values({
        organizationId,
        type: "expire_assertion",
        payload: { assertionId: replacement.id },
        runAfter: input.expiresAt,
        idempotencyKey: `assertion-expiry:${replacement.id}:${input.expiresAt.toISOString()}`,
        concurrencyKey: `assertion:${replacement.id}`,
      }),
      tx.insert(jobs).values({
        organizationId,
        type: "build_replay_corpus",
        payload: {
          apiServiceId: current.apiServiceId,
          reason: "assertion_extended",
          assertionId: replacement.id,
        },
        idempotencyKey: `assertion-corpus:${replacement.id}:extended`,
        concurrencyKey: `corpus:${current.apiServiceId}`,
      }),
      appendDomainEvent(tx, organizationId, current.id, "assertion.extended", {
        assertionId: current.id,
        replacementAssertionId: replacement.id,
        expiresAt: input.expiresAt.toISOString(),
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "assertion.extended",
        resourceType: "assertion",
        resourceId: current.id,
        requestId: actor.requestId,
        changes: { replacementAssertionId: replacement.id },
        outcome: "succeeded",
      }),
    ]);
    return replacement;
  });
}

export async function scheduleBreakingChange(
  db: Database,
  organizationId: string,
  assertionId: string,
  actor: AssertionActor,
  input: { plannedFor: Date; communicationDueAt?: Date; reason: string; expectedUpdatedAt: Date },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.execute(
      sql`select id from assertions where organization_id = ${organizationId} and id = ${assertionId} for update`,
    );
    const [assertion] = await tx
      .select()
      .from(assertions)
      .where(and(eq(assertions.organizationId, organizationId), eq(assertions.id, assertionId)))
      .limit(1);
    if (!assertion) throw new AssertionDomainError("not_found", "Assertion was not found");
    if (!(assertion.status === "active" || assertion.status === "expiring")) {
      throw new AssertionDomainError("conflict", "Only active assertions can schedule a break");
    }
    if (assertion.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new AssertionDomainError("conflict", "Assertion changed; refresh before scheduling");
    }
    const now = new Date();
    if (input.plannedFor <= now || input.plannedFor > assertion.expiresAt) {
      throw new AssertionDomainError(
        "invalid",
        "Planned break must be future-dated within assertion validity",
      );
    }
    if (
      input.communicationDueAt &&
      (input.communicationDueAt <= now || input.communicationDueAt > input.plannedFor)
    ) {
      throw new AssertionDomainError(
        "invalid",
        "Communication due date must precede the planned break",
      );
    }
    const selected =
      assertion.scope === "selected_consumers"
        ? await tx
            .select({ consumerId: assertionConsumers.consumerId })
            .from(assertionConsumers)
            .where(
              and(
                eq(assertionConsumers.organizationId, organizationId),
                eq(assertionConsumers.assertionId, assertion.id),
              ),
            )
        : null;
    const selectedIds = selected?.map(({ consumerId }) => consumerId);
    const claimConditions = [
      eq(dependencyClaims.organizationId, organizationId),
      eq(dependencyClaims.apiServiceId, assertion.apiServiceId),
      eq(dependencyClaims.behaviorDefinitionId, assertion.behaviorDefinitionId),
      eq(dependencyClaims.status, "active"),
    ];
    if (selectedIds) claimConditions.push(inArray(dependencyClaims.consumerId, selectedIds));
    const impacts = await tx
      .select({
        consumerId: dependencyClaims.consumerId,
        claimId: dependencyClaims.id,
        tier: dependencyClaims.tier,
        lastObservedAt: ledgerEntries.lastObservedAt,
        receiptId: claimEvidence.receiptId,
      })
      .from(dependencyClaims)
      .innerJoin(
        ledgerEntries,
        and(
          eq(ledgerEntries.organizationId, dependencyClaims.organizationId),
          eq(ledgerEntries.dependencyClaimId, dependencyClaims.id),
        ),
      )
      .leftJoin(
        claimEvidence,
        and(
          eq(claimEvidence.organizationId, dependencyClaims.organizationId),
          eq(claimEvidence.dependencyClaimId, dependencyClaims.id),
          eq(claimEvidence.evidenceRole, "primary"),
        ),
      )
      .where(and(...claimConditions));
    const unique = new Map<string, (typeof impacts)[number]>();
    for (const impact of impacts)
      if (!unique.has(impact.consumerId)) unique.set(impact.consumerId, impact);
    const [plan] = await tx
      .insert(breakingChangePlans)
      .values({
        organizationId,
        apiServiceId: assertion.apiServiceId,
        assertionId: assertion.id,
        behaviorDefinitionId: assertion.behaviorDefinitionId,
        ownerMembershipId: assertion.ownerMembershipId,
        plannedFor: input.plannedFor,
        status: "scheduled",
        reason: input.reason,
        communicationDueAt: input.communicationDueAt,
      })
      .onConflictDoNothing()
      .returning({
        id: breakingChangePlans.id,
        status: breakingChangePlans.status,
        plannedFor: breakingChangePlans.plannedFor,
        communicationDueAt: breakingChangePlans.communicationDueAt,
      });
    if (!plan)
      throw new AssertionDomainError(
        "conflict",
        "A breaking change is already scheduled for this assertion",
      );
    if (unique.size) {
      await tx.insert(breakingChangeImpacts).values(
        [...unique.values()].map((impact) => ({
          organizationId,
          breakingChangePlanId: plan.id,
          consumerId: impact.consumerId,
          dependencyClaimId: impact.claimId,
          evidenceTier: impact.tier,
          impactDigest: digest({
            assertionId: assertion.id,
            consumerId: impact.consumerId,
            claimId: impact.claimId,
            tier: impact.tier,
            lastObservedAt: impact.lastObservedAt.toISOString(),
          }),
          lastObservedAt: impact.lastObservedAt,
          receiptId: impact.receiptId,
        })),
      );
    }
    const payload = {
      assertionId: assertion.id,
      planId: plan.id,
      plannedFor: input.plannedFor.toISOString(),
      impactCount: unique.size,
    };
    await Promise.all([
      tx.insert(assertionEvents).values({
        organizationId,
        assertionId: assertion.id,
        eventType: "break_scheduled",
        actorType: "user",
        actorId: actor.userId,
        reason: input.reason,
        metadata: payload,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "assertion.break_scheduled",
        resourceType: "breaking_change_plan",
        resourceId: plan.id,
        requestId: actor.requestId,
        changes: payload,
        outcome: "succeeded",
      }),
      appendDomainEvent(tx, organizationId, assertion.id, "assertion.break_scheduled", payload),
    ]);
    return { ...plan, assertionId: assertion.id, impactCount: unique.size };
  });
}

export async function resolveAssertion(
  db: Database,
  organizationId: string,
  assertionId: string,
  actor: AssertionActor,
  input: { resolution: "documented" | "cancelled"; reason: string; expectedUpdatedAt: Date },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await tx.execute(
      sql`select id from assertions where organization_id = ${organizationId} and id = ${assertionId} for update`,
    );
    const [current] = await tx
      .select()
      .from(assertions)
      .where(and(eq(assertions.organizationId, organizationId), eq(assertions.id, assertionId)))
      .limit(1);
    if (!current) throw new AssertionDomainError("not_found", "Assertion was not found");
    if (current.status !== "active" && current.status !== "expiring")
      throw new AssertionDomainError("conflict", "Only active assertions can be resolved");
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new AssertionDomainError("conflict", "Assertion changed; refresh before resolving");
    if (input.resolution === "documented") {
      const [accepted] = await tx
        .select({ id: generatedDrafts.id })
        .from(generatedDrafts)
        .where(
          and(
            eq(generatedDrafts.organizationId, organizationId),
            eq(generatedDrafts.assertionId, assertionId),
            eq(generatedDrafts.draftType, "spec_patch"),
            eq(generatedDrafts.status, "accepted"),
          ),
        )
        .limit(1);
      if (!accepted)
        throw new AssertionDomainError(
          "invalid",
          "Accept an OpenAPI patch draft before marking this assertion documented",
        );
    }
    const now = new Date();
    const status =
      input.resolution === "cancelled" ? ("cancelled" as const) : ("resolved" as const);
    const [resolved] = await tx
      .update(assertions)
      .set({
        status,
        resolution: input.resolution,
        resolvedAt: now,
        resolvedByMembershipId: actor.membershipId,
        updatedAt: now,
      })
      .where(and(eq(assertions.organizationId, organizationId), eq(assertions.id, assertionId)))
      .returning({ id: assertions.id, apiServiceId: assertions.apiServiceId });
    if (!resolved) throw new Error("Assertion resolution returned no record");
    await tx
      .update(jobs)
      .set({ status: "cancelled", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(jobs.organizationId, organizationId),
          eq(jobs.concurrencyKey, `assertion:${assertionId}`),
          eq(jobs.status, "pending"),
        ),
      );
    const payload = { assertionId, resolution: input.resolution, reason: input.reason };
    await Promise.all([
      tx.insert(assertionEvents).values({
        organizationId,
        assertionId,
        eventType: input.resolution === "documented" ? "documented" : "cancelled",
        actorType: "user",
        actorId: actor.userId,
        reason: input.reason,
        metadata: payload,
      }),
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: `assertion.${input.resolution}`,
        resourceType: "assertion",
        resourceId: assertionId,
        requestId: actor.requestId,
        changes: payload,
        outcome: "succeeded",
      }),
      appendDomainEvent(tx, organizationId, assertionId, `assertion.${input.resolution}`, payload),
    ]);
    return resolved;
  });
}
