import { and, eq } from "drizzle-orm";
import type { Database } from "./index";
import {
  auditEvents,
  notificationRoutes,
  organizationKeyVersions,
  slackInstallations,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export async function registerSlackInstallation(
  db: Database,
  organizationId: string,
  actor: { membershipId: string; userId: string; requestId: string },
  input: {
    slackTeamId: string;
    teamName: string;
    encryptedBotToken: string;
    channelId: string;
    keyReference: string;
    scopes: string[];
  },
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const now = new Date();
    await tx
      .insert(organizationKeyVersions)
      .values({
        organizationId,
        purpose: "integration_encryption",
        version: 1,
        kmsKeyReference: input.keyReference,
        status: "active",
        activatedAt: now,
      })
      .onConflictDoNothing();
    const [key] = await tx
      .select({ id: organizationKeyVersions.id })
      .from(organizationKeyVersions)
      .where(
        and(
          eq(organizationKeyVersions.organizationId, organizationId),
          eq(organizationKeyVersions.purpose, "integration_encryption"),
          eq(organizationKeyVersions.status, "active"),
        ),
      )
      .limit(1);
    if (!key) throw new Error("Integration encryption key metadata is unavailable");
    const [installation] = await tx
      .insert(slackInstallations)
      .values({
        organizationId,
        slackTeamId: input.slackTeamId,
        teamName: input.teamName,
        status: "active",
        encryptedBotToken: input.encryptedBotToken,
        encryptionKeyVersionId: key.id,
        scopes: input.scopes,
        installedByMembershipId: actor.membershipId,
        installedAt: now,
      })
      .onConflictDoUpdate({
        target: [slackInstallations.organizationId, slackInstallations.slackTeamId],
        set: {
          teamName: input.teamName,
          status: "active",
          encryptedBotToken: input.encryptedBotToken,
          encryptionKeyVersionId: key.id,
          scopes: input.scopes,
          installedByMembershipId: actor.membershipId,
          installedAt: now,
          revokedAt: null,
          updatedAt: now,
        },
      })
      .returning({
        id: slackInstallations.id,
        teamId: slackInstallations.slackTeamId,
        teamName: slackInstallations.teamName,
        status: slackInstallations.status,
        installedAt: slackInstallations.installedAt,
      });
    if (!installation) throw new Error("Slack installation creation returned no record");
    for (const eventType of [
      "gate.block",
      "gate.warn",
      "assertion.expiring",
      "assertion.expired",
    ]) {
      await tx
        .insert(notificationRoutes)
        .values({
          organizationId,
          eventType,
          channel: "slack",
          slackInstallationId: installation.id,
          destinationId: input.channelId,
          minimumSeverity: eventType === "gate.block" ? "critical" : "warning",
          createdByMembershipId: actor.membershipId,
        })
        .onConflictDoNothing();
    }
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: now,
      actorType: "user",
      actorId: actor.userId,
      action: "slack.installation_configured",
      resourceType: "slack_installation",
      resourceId: installation.id,
      requestId: actor.requestId,
      changes: { teamId: input.slackTeamId, channelId: input.channelId, scopes: input.scopes },
      outcome: "succeeded",
    });
    return installation;
  });
}

export async function getSlackInstallation(db: Database, organizationId: string) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .select({
        id: slackInstallations.id,
        teamId: slackInstallations.slackTeamId,
        teamName: slackInstallations.teamName,
        status: slackInstallations.status,
        installedAt: slackInstallations.installedAt,
        channelId: notificationRoutes.destinationId,
      })
      .from(slackInstallations)
      .leftJoin(
        notificationRoutes,
        and(
          eq(notificationRoutes.organizationId, slackInstallations.organizationId),
          eq(notificationRoutes.slackInstallationId, slackInstallations.id),
          eq(notificationRoutes.channel, "slack"),
          eq(notificationRoutes.enabled, true),
        ),
      )
      .where(
        and(
          eq(slackInstallations.organizationId, organizationId),
          eq(slackInstallations.status, "active"),
        ),
      )
      .limit(1);
    return record ?? null;
  });
}
