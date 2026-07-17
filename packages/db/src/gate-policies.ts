import { createHash } from "node:crypto";
import type { UpdateGatePolicy } from "@hyrum/contracts";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "./index";
import { auditEvents, gatePolicies, gatePolicyVersions, outboxEvents } from "./schema";
import { withOrganizationContext } from "./tenancy";

export class GatePolicyError extends Error {
  constructor(
    public readonly code: "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "GatePolicyError";
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function checkedAction<T extends string>(value: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T))
    throw new Error("Persisted gate policy violates its invariant");
  return value as T;
}

export async function getDefaultGatePolicy(
  db: Database,
  organizationId: string,
  apiServiceId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [row] = await tx
      .select({
        id: gatePolicies.id,
        name: gatePolicies.name,
        description: gatePolicies.description,
        version: gatePolicyVersions.version,
        t1Action: gatePolicyVersions.t1Action,
        t2Action: gatePolicyVersions.t2Action,
        t3Action: gatePolicyVersions.t3Action,
        assertionAction: gatePolicyVersions.assertionAction,
        flakyAction: gatePolicyVersions.flakyAction,
        minimumStableAttempts: gatePolicyVersions.minimumStableAttempts,
        activatedAt: gatePolicyVersions.activatedAt,
      })
      .from(gatePolicies)
      .innerJoin(
        gatePolicyVersions,
        and(
          eq(gatePolicyVersions.organizationId, gatePolicies.organizationId),
          eq(gatePolicyVersions.gatePolicyId, gatePolicies.id),
          eq(gatePolicyVersions.status, "active"),
        ),
      )
      .where(
        and(
          eq(gatePolicies.organizationId, organizationId),
          eq(gatePolicies.apiServiceId, apiServiceId),
          eq(gatePolicies.isDefault, true),
          isNull(gatePolicies.deletedAt),
        ),
      )
      .limit(1);
    if (!row?.activatedAt) return null;
    return {
      ...row,
      t1Action: checkedAction(row.t1Action, ["block", "warn", "note"] as const),
      t2Action: checkedAction(row.t2Action, ["warn", "note", "pass"] as const),
      t3Action: checkedAction(row.t3Action, ["note", "pass"] as const),
      assertionAction: checkedAction(row.assertionAction, ["block", "warn", "note"] as const),
      flakyAction: checkedAction(row.flakyAction, ["warn", "note", "pass"] as const),
      activatedAt: row.activatedAt,
    };
  });
}

export async function updateDefaultGatePolicy(
  db: Database,
  organizationId: string,
  apiServiceId: string,
  actor: { userId: string; membershipId: string; requestId: string },
  input: UpdateGatePolicy,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [current] = await tx
      .select({
        policyId: gatePolicies.id,
        versionId: gatePolicyVersions.id,
        version: gatePolicyVersions.version,
      })
      .from(gatePolicies)
      .innerJoin(
        gatePolicyVersions,
        and(
          eq(gatePolicyVersions.organizationId, gatePolicies.organizationId),
          eq(gatePolicyVersions.gatePolicyId, gatePolicies.id),
          eq(gatePolicyVersions.status, "active"),
        ),
      )
      .where(
        and(
          eq(gatePolicies.organizationId, organizationId),
          eq(gatePolicies.apiServiceId, apiServiceId),
          eq(gatePolicies.isDefault, true),
          isNull(gatePolicies.deletedAt),
        ),
      )
      .limit(1);
    if (!current) throw new GatePolicyError("not_found", "Default gate policy not found");
    if (current.version !== input.expectedVersion) {
      throw new GatePolicyError("conflict", "Gate policy changed; reload before saving");
    }
    const now = new Date();
    const config = {
      t1Action: input.t1Action,
      t2Action: input.t2Action,
      t3Action: input.t3Action,
      assertionAction: input.assertionAction,
      flakyAction: input.flakyAction,
      minimumStableAttempts: input.minimumStableAttempts,
    };
    const [superseded] = await tx
      .update(gatePolicyVersions)
      .set({ status: "superseded" })
      .where(
        and(
          eq(gatePolicyVersions.organizationId, organizationId),
          eq(gatePolicyVersions.id, current.versionId),
          eq(gatePolicyVersions.status, "active"),
        ),
      )
      .returning({ id: gatePolicyVersions.id });
    if (!superseded)
      throw new GatePolicyError("conflict", "Gate policy changed; reload before saving");
    const [created] = await tx
      .insert(gatePolicyVersions)
      .values({
        organizationId,
        gatePolicyId: current.policyId,
        version: current.version + 1,
        config,
        configDigest: digest(config),
        ...config,
        status: "active",
        createdByMembershipId: actor.membershipId,
        activatedAt: now,
      })
      .returning({ id: gatePolicyVersions.id, version: gatePolicyVersions.version });
    if (!created) throw new Error("Gate policy version creation returned no record");
    const event = {
      gatePolicyId: current.policyId,
      gatePolicyVersionId: created.id,
      version: created.version,
    };
    await Promise.all([
      tx.insert(auditEvents).values({
        organizationId,
        occurredAt: now,
        actorType: "user",
        actorId: actor.userId,
        action: "gate_policy.activated",
        resourceType: "gate_policy",
        resourceId: current.policyId,
        requestId: actor.requestId,
        changes: { previousVersion: current.version, ...event },
        outcome: "succeeded",
      }),
      tx.insert(outboxEvents).values({
        organizationId,
        topic: "gate_policy.activated",
        aggregateType: "gate_policy",
        aggregateId: current.policyId,
        eventVersion: created.version,
        payload: event,
        payloadDigest: digest(event),
      }),
    ]);
    return created;
  });
}
