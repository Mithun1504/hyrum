import type { Sql } from "postgres";

export async function claimWebhookDelivery(
  sql: Sql,
  input: {
    provider: string;
    deliveryId: string;
    eventType: string;
    payloadDigest: string;
  },
): Promise<boolean> {
  const rows = await sql<{ claimed: boolean }[]>`
    select hyrum_claim_webhook_delivery(
      ${input.provider}, ${input.deliveryId}, ${input.eventType}, ${input.payloadDigest}
    ) as claimed
  `;
  return rows[0]?.claimed ?? false;
}

export async function finishWebhookDelivery(
  sql: Sql,
  input: {
    provider: string;
    deliveryId: string;
    workosOrganizationId: string | null;
    status: "processed" | "ignored" | "failed";
    errorCode: string | null;
  },
): Promise<void> {
  await sql`
    select hyrum_finish_webhook_delivery(
      ${input.provider}, ${input.deliveryId}, ${input.workosOrganizationId},
      ${input.status}, ${input.errorCode}
    )
  `;
}

export async function revokeWorkosMembership(sql: Sql, workosMembershipId: string): Promise<void> {
  await sql`select hyrum_revoke_workos_membership(${workosMembershipId})`;
}

export async function syncWorkosInvitationState(
  sql: Sql,
  input: {
    workosInvitationId: string;
    status: "pending" | "accepted" | "expired" | "revoked";
    expiresAt: Date;
    acceptedAt: Date | null;
  },
): Promise<void> {
  await sql`
    select hyrum_sync_workos_invitation_state(
      ${input.workosInvitationId}, ${input.status}, ${input.expiresAt.toISOString()},
      ${input.acceptedAt?.toISOString() ?? null}
    )
  `;
}
