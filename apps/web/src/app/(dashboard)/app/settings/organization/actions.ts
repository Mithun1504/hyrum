"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { updateOrganizationRequestSchema, updateRetentionRequestSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentControlPlaneClient } from "@/services/control-plane";

export interface OrganizationActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function failure(error: unknown): OrganizationActionState {
  if (error instanceof ControlPlaneError) {
    return { status: "error", message: error.problem.detail ?? "The settings could not be saved." };
  }
  if (error instanceof z.ZodError) {
    return { status: "error", message: "Review the submitted settings and try again." };
  }
  return { status: "error", message: "An unexpected error occurred. Try again." };
}

export async function saveOrganizationSettings(
  _previous: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const input = updateOrganizationRequestSchema.parse({
      name: formData.get("name"),
      timezone: formData.get("timezone"),
      staleAfterDays: Number(formData.get("staleAfterDays")),
      defaultAssertionDays: Number(formData.get("defaultAssertionDays")),
      defaultReceiptTtlDays: Number(formData.get("defaultReceiptTtlDays")),
      notificationDigestEnabled: formData.get("notificationDigestEnabled") === "true",
      dataExportEnabled: formData.get("dataExportEnabled") === "true",
    });
    await (await currentControlPlaneClient()).updateOrganization(input);
    revalidatePath("/app", "layout");
    return { status: "success", message: "Organization settings saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function saveRetention(
  _previous: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const input = updateRetentionRequestSchema.parse({
      retentionDays: Number(formData.get("retentionDays")),
    });
    await (await currentControlPlaneClient()).updateRetention(input);
    revalidatePath("/app", "layout");
    return { status: "success", message: "Retention policy saved." };
  } catch (error) {
    return failure(error);
  }
}
