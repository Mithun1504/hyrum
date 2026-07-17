import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
} from "@hyrum/contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import { auditEvents, invitations, memberships, users } from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface MembershipActor {
  userId: string;
  membershipId: string;
  role: OrganizationRole;
  requestId: string;
}

export interface InvitationSnapshot {
  email: string;
  role: Exclude<OrganizationRole, "owner">;
  workosInvitationId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  status: "pending" | "accepted" | "expired" | "revoked";
}

interface MemberProviderIdentity {
  id: string;
  workosMembershipId: string | null;
  role: OrganizationRole;
  status: "invited" | "active" | "suspended" | "revoked";
}

export interface InvitationProviderIdentity {
  id: string;
  workosInvitationId: string;
  status: "pending" | "accepted" | "expired" | "revoked";
}

function serializeMember(row: {
  membership: typeof memberships.$inferSelect;
  user: typeof users.$inferSelect;
}): OrganizationMember {
  return {
    id: row.membership.id,
    userId: row.user.id,
    email: row.user.primaryEmail,
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    role: row.membership.role,
    status: row.membership.status,
    joinedAt: row.membership.joinedAt?.toISOString() ?? null,
    updatedAt: row.membership.updatedAt.toISOString(),
  };
}

function serializeInvitation(record: typeof invitations.$inferSelect): OrganizationInvitation {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    status: record.status,
    invitedByMembershipId: record.invitedByMembershipId,
    expiresAt: record.expiresAt.toISOString(),
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function listMemberDirectory(
  db: Database,
  organizationId: string,
): Promise<{ members: OrganizationMember[]; invitations: OrganizationInvitation[] }> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [memberRows, invitationRows] = await Promise.all([
      tx
        .select({ membership: memberships, user: users })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organizationId, organizationId))
        .orderBy(asc(users.primaryEmail)),
      tx
        .select()
        .from(invitations)
        .where(eq(invitations.organizationId, organizationId))
        .orderBy(asc(invitations.email)),
    ]);
    return {
      members: memberRows.map(serializeMember),
      invitations: invitationRows.map(serializeInvitation),
    };
  });
}

export async function getMemberProviderIdentity(
  db: Database,
  organizationId: string,
  membershipId: string,
): Promise<MemberProviderIdentity | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .select({
        id: memberships.id,
        workosMembershipId: memberships.workosMembershipId,
        role: memberships.role,
        status: memberships.status,
      })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.id, membershipId)))
      .limit(1);
    return record ?? null;
  });
}

export async function getInvitationProviderIdentity(
  db: Database,
  organizationId: string,
  invitationId: string,
): Promise<InvitationProviderIdentity | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .select({
        id: invitations.id,
        workosInvitationId: invitations.workosInvitationId,
        status: invitations.status,
      })
      .from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), eq(invitations.id, invitationId)))
      .limit(1);
    return record ?? null;
  });
}

export async function updateOrganizationInvitation(
  db: Database,
  organizationId: string,
  actor: MembershipActor,
  invitationId: string,
  snapshot: Pick<InvitationSnapshot, "status" | "expiresAt" | "acceptedAt">,
): Promise<OrganizationInvitation | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .update(invitations)
      .set({
        status: snapshot.status,
        expiresAt: snapshot.expiresAt,
        acceptedAt: snapshot.acceptedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(invitations.organizationId, organizationId), eq(invitations.id, invitationId)))
      .returning();
    if (!record) return null;
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: snapshot.status === "revoked" ? "invitation.revoked" : "invitation.resent",
      resourceType: "invitation",
      resourceId: invitationId,
      requestId: actor.requestId,
      changes: { status: snapshot.status, expiresAt: snapshot.expiresAt.toISOString() },
      outcome: "succeeded",
    });
    return serializeInvitation(record);
  });
}

export async function recordOrganizationInvitation(
  db: Database,
  organizationId: string,
  actor: MembershipActor,
  invitation: InvitationSnapshot,
): Promise<OrganizationInvitation> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .insert(invitations)
      .values({
        organizationId,
        email: invitation.email,
        role: invitation.role,
        workosInvitationId: invitation.workosInvitationId,
        invitedByMembershipId: actor.membershipId,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
      })
      .returning();
    if (!record) throw new Error("Invitation creation returned no record");
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: "member.invited",
      resourceType: "invitation",
      resourceId: record.id,
      requestId: actor.requestId,
      changes: { email: record.email, role: record.role, status: record.status },
      outcome: "succeeded",
    });
    return serializeInvitation(record);
  });
}

export async function updateOrganizationMember(
  db: Database,
  organizationId: string,
  actor: MembershipActor,
  membershipId: string,
  changes: { role?: Exclude<OrganizationRole, "owner">; status?: "active" | "suspended" },
): Promise<OrganizationMember | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [before] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.id, membershipId)))
      .limit(1);
    if (!before) return null;
    if (before.role === "owner") throw new Error("OWNER_MEMBER_REQUIRES_TRANSFER");
    if (membershipId === actor.membershipId && changes.status === "suspended") {
      throw new Error("MEMBER_CANNOT_SUSPEND_SELF");
    }

    const [updated] = await tx
      .update(memberships)
      .set({
        ...(changes.role ? { role: changes.role } : {}),
        ...(changes.status
          ? {
              status: changes.status,
              suspendedAt: changes.status === "suspended" ? new Date() : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.id, membershipId)))
      .returning();
    if (!updated) return null;

    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: changes.role ? "member.role_updated" : "member.status_updated",
      resourceType: "membership",
      resourceId: membershipId,
      requestId: actor.requestId,
      changes: {
        before: { role: before.role, status: before.status },
        after: { role: updated.role, status: updated.status },
      },
      outcome: "succeeded",
    });

    const [result] = await tx
      .select({ membership: memberships, user: users })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.id, membershipId)))
      .limit(1);
    return result ? serializeMember(result) : null;
  });
}

export async function transferOrganizationOwnership(
  db: Database,
  organizationId: string,
  actor: MembershipActor,
  targetMembershipId: string,
): Promise<void> {
  await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.execute(
      sql`select id from memberships where organization_id = ${organizationId} for update`,
    );
    const [currentOwner, target] = await Promise.all([
      tx.query.memberships.findFirst({
        where: and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.id, actor.membershipId),
        ),
      }),
      tx.query.memberships.findFirst({
        where: and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.id, targetMembershipId),
        ),
      }),
    ]);
    if (currentOwner?.role !== "owner") throw new Error("ACTOR_IS_NOT_OWNER");
    if (target?.status !== "active") throw new Error("TARGET_MUST_BE_ACTIVE");
    if (target.id === currentOwner.id) throw new Error("TARGET_ALREADY_OWNER");

    await tx
      .update(memberships)
      .set({ role: "owner", updatedAt: new Date() })
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.id, target.id)));
    await tx
      .update(memberships)
      .set({ role: "admin", updatedAt: new Date() })
      .where(
        and(eq(memberships.organizationId, organizationId), eq(memberships.id, currentOwner.id)),
      );
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: "organization.ownership_transferred",
      resourceType: "organization",
      resourceId: organizationId,
      requestId: actor.requestId,
      changes: { fromMembershipId: currentOwner.id, toMembershipId: target.id },
      outcome: "succeeded",
    });
  });
}
