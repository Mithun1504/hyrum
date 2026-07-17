import type {
  OnboardingProgress,
  UpdateOrganizationRequest,
  UpdateRetentionRequest,
} from "@hyrum/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiServices,
  auditEvents,
  onboardingProgress,
  organizationSettings,
  organizations,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

export interface OrganizationSettingsActor {
  userId: string;
  membershipId: string;
  requestId: string;
}

export async function updateOrganizationSettings(
  db: Database,
  organizationId: string,
  actor: OrganizationSettingsActor,
  input: UpdateOrganizationRequest,
): Promise<void> {
  await withOrganizationContext(db, organizationId, async (tx) => {
    await tx
      .update(organizations)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.staleAfterDays !== undefined ? { staleAfterDays: input.staleAfterDays } : {}),
        settingsVersion: sql`${organizations.settingsVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));
    const settingsChanges = {
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.defaultAssertionDays !== undefined
        ? { defaultAssertionDays: input.defaultAssertionDays }
        : {}),
      ...(input.defaultReceiptTtlDays !== undefined
        ? { defaultReceiptTtlDays: input.defaultReceiptTtlDays }
        : {}),
      ...(input.notificationDigestEnabled !== undefined
        ? { notificationDigestEnabled: input.notificationDigestEnabled }
        : {}),
      ...(input.dataExportEnabled !== undefined
        ? { dataExportEnabled: input.dataExportEnabled }
        : {}),
    };
    if (Object.keys(settingsChanges).length > 0) {
      await tx
        .update(organizationSettings)
        .set({ ...settingsChanges, updatedAt: new Date() })
        .where(eq(organizationSettings.organizationId, organizationId));
    }
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: "organization.settings_updated",
      resourceType: "organization",
      resourceId: organizationId,
      requestId: actor.requestId,
      changes: input,
      outcome: "succeeded",
    });
  });
}

export async function updateOrganizationRetention(
  db: Database,
  organizationId: string,
  actor: OrganizationSettingsActor,
  input: UpdateRetentionRequest,
): Promise<void> {
  await withOrganizationContext(db, organizationId, async (tx) => {
    await tx
      .update(organizations)
      .set({
        retentionDays: input.retentionDays,
        settingsVersion: sql`${organizations.settingsVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));
    await tx.insert(auditEvents).values({
      organizationId,
      occurredAt: new Date(),
      actorType: "user",
      actorId: actor.userId,
      action: "organization.retention_updated",
      resourceType: "organization",
      resourceId: organizationId,
      requestId: actor.requestId,
      changes: { retentionDays: input.retentionDays },
      outcome: "succeeded",
    });
  });
}

export async function getServiceOnboardingProgress(
  db: Database,
  organizationId: string,
  serviceIdentifier: string,
): Promise<OnboardingProgress | null> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [record] = await tx
      .select({ progress: onboardingProgress })
      .from(onboardingProgress)
      .innerJoin(
        apiServices,
        and(
          eq(apiServices.id, onboardingProgress.apiServiceId),
          eq(apiServices.organizationId, onboardingProgress.organizationId),
        ),
      )
      .where(
        and(
          eq(onboardingProgress.organizationId, organizationId),
          sql`(${apiServices.id}::text = ${serviceIdentifier} or ${apiServices.slug} = ${serviceIdentifier})`,
        ),
      )
      .limit(1);
    if (!record) return null;
    return {
      apiServiceId: record.progress.apiServiceId,
      currentStep: record.progress.currentStep,
      completedSteps: record.progress.completedSteps,
      dismissedSteps: record.progress.dismissedSteps,
      lastErrorCode: record.progress.lastErrorCode,
      completedAt: record.progress.completedAt?.toISOString() ?? null,
      updatedAt: record.progress.updatedAt.toISOString(),
    };
  });
}
