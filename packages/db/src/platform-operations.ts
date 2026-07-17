import { createHash } from "node:crypto";
import type { Permission } from "@hyrum/contracts";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  organizations,
  platformAuditEvents,
  platformOperators,
  supportAccessGrants,
  users,
} from "./schema";

const READ_ONLY_SUPPORT_SCOPES = new Set<Permission>([
  "organization:read",
  "member:read",
  "service:read",
  "spec:read",
  "agent:read",
  "ledger:read",
  "assertion:read",
  "corpus:read",
  "replay:read",
  "policy:read",
  "gate:read",
  "integration:read",
  "report:read",
  "audit:read",
]);

export interface PlatformOperatorIdentity {
  id: string;
  userId: string;
  capabilities: string[];
}

export async function resolvePlatformOperator(
  db: Database,
  workosUserId: string,
): Promise<PlatformOperatorIdentity | null> {
  const [operator] = await db
    .select({
      id: platformOperators.id,
      userId: platformOperators.userId,
      capabilities: platformOperators.capabilities,
    })
    .from(platformOperators)
    .innerJoin(users, eq(users.id, platformOperators.userId))
    .where(
      and(
        eq(users.workosUserId, workosUserId),
        eq(platformOperators.status, "active"),
        isNull(platformOperators.revokedAt),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return operator ?? null;
}

export async function resolveActiveSupportAccess(
  db: Database,
  workosUserId: string,
  grantId: string,
) {
  const now = new Date();
  const [grant] = await db
    .select({
      grantId: supportAccessGrants.id,
      organizationId: supportAccessGrants.organizationId,
      operatorId: platformOperators.id,
      userId: platformOperators.userId,
      scopes: supportAccessGrants.scopes,
    })
    .from(supportAccessGrants)
    .innerJoin(platformOperators, eq(platformOperators.id, supportAccessGrants.platformOperatorId))
    .innerJoin(users, eq(users.id, platformOperators.userId))
    .innerJoin(organizations, eq(organizations.id, supportAccessGrants.organizationId))
    .where(
      and(
        eq(supportAccessGrants.id, grantId),
        eq(users.workosUserId, workosUserId),
        eq(platformOperators.status, "active"),
        isNull(platformOperators.revokedAt),
        sql`${supportAccessGrants.approvedByOperatorId} is not null`,
        lte(supportAccessGrants.startsAt, now),
        gt(supportAccessGrants.expiresAt, now),
        isNull(supportAccessGrants.revokedAt),
        eq(organizations.status, "active"),
      ),
    )
    .limit(1);
  if (!grant) return null;
  const scopes = grant.scopes.filter((scope): scope is Permission =>
    READ_ONLY_SUPPORT_SCOPES.has(scope as Permission),
  );
  return { ...grant, scopes };
}

function auditDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function createSupportGrant(
  db: Database,
  operator: PlatformOperatorIdentity,
  requestId: string,
  input: {
    organizationId: string;
    reason: string;
    ticketReference: string;
    scopes: Permission[];
    durationMinutes: number;
  },
) {
  if (!input.scopes.every((scope) => READ_ONLY_SUPPORT_SCOPES.has(scope))) {
    throw new Error("Support grants are read-only and contain an unsupported scope");
  }
  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.id, input.organizationId), eq(organizations.status, "active")));
    if (!organization) return null;
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    const [grant] = await tx
      .insert(supportAccessGrants)
      .values({
        organizationId: input.organizationId,
        platformOperatorId: operator.id,
        reason: input.reason,
        ticketReference: input.ticketReference,
        scopes: input.scopes,
        startsAt,
        expiresAt,
      })
      .returning();
    if (!grant) throw new Error("Support grant could not be created");
    await tx.insert(platformAuditEvents).values({
      occurredAt: startsAt,
      actorType: "platform_operator",
      actorId: operator.id,
      action: "support_grant.requested",
      resourceType: "support_access_grant",
      resourceId: grant.id,
      requestId,
      changeDigest: auditDigest({ ...input, reason: "[recorded-in-grant]" }),
      metadata: { organizationId: input.organizationId, ticketReference: input.ticketReference },
      outcome: "succeeded",
    });
    return grant;
  });
}

export async function approveSupportGrant(
  db: Database,
  approver: PlatformOperatorIdentity,
  requestId: string,
  grantId: string,
) {
  return db.transaction(async (tx) => {
    const [grant] = await tx
      .update(supportAccessGrants)
      .set({ approvedByOperatorId: approver.id })
      .where(
        and(
          eq(supportAccessGrants.id, grantId),
          sql`${supportAccessGrants.platformOperatorId} <> ${approver.id}`,
          sql`${supportAccessGrants.approvedByOperatorId} is null`,
          gt(supportAccessGrants.expiresAt, new Date()),
          isNull(supportAccessGrants.revokedAt),
        ),
      )
      .returning();
    if (!grant) return null;
    await tx.insert(platformAuditEvents).values({
      occurredAt: new Date(),
      actorType: "platform_operator",
      actorId: approver.id,
      action: "support_grant.approved",
      resourceType: "support_access_grant",
      resourceId: grant.id,
      requestId,
      changeDigest: auditDigest({ grantId: grant.id, approvedByOperatorId: approver.id }),
      metadata: { organizationId: grant.organizationId, ticketReference: grant.ticketReference },
      outcome: "succeeded",
    });
    return grant;
  });
}

export async function getPlatformHealth(db: Database) {
  const [counts] = await db.execute<Record<string, unknown>>(sql`
    select
      count(*) filter (where status = 'pending')::int pending,
      count(*) filter (where status = 'running')::int running,
      count(*) filter (where status = 'dead')::int dead
    from jobs
  `);
  const [deleting] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizations)
    .where(eq(organizations.status, "deleting"));
  return {
    jobs: {
      pending: Number(counts?.pending ?? 0),
      running: Number(counts?.running ?? 0),
      dead: Number(counts?.dead ?? 0),
    },
    deletingOrganizations: deleting?.count ?? 0,
  };
}
