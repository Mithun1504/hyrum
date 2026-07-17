"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { createDataSubjectRequestSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentControlPlaneClient } from "@/services/control-plane";

export interface PrivacyActionState {
  status: "idle" | "success" | "error";
  message?: string;
  downloadUrl?: string;
}

function failure(error: unknown): PrivacyActionState {
  if (error instanceof ControlPlaneError) {
    return { status: "error", message: error.problem.detail ?? "The privacy request failed." };
  }
  if (error instanceof z.ZodError)
    return { status: "error", message: "Check the confirmation text." };
  return { status: "error", message: "An unexpected error occurred." };
}

export async function requestOrganizationExport(
  _previous: PrivacyActionState,
  formData: FormData,
): Promise<PrivacyActionState> {
  try {
    const input = createDataSubjectRequestSchema.parse({
      requestType: "export",
      confirmation: formData.get("confirmation"),
    });
    await (await currentControlPlaneClient()).createPrivacyRequest(input);
    revalidatePath("/app/settings/privacy");
    return {
      status: "success",
      message: "Export queued. It will remain available for seven days.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createExportDownload(requestId: string): Promise<PrivacyActionState> {
  try {
    const download = await (await currentControlPlaneClient()).privacyExportDownload(requestId);
    return { status: "success", downloadUrl: download.url };
  } catch (error) {
    return failure(error);
  }
}

export async function requestOrganizationDeletion(
  _previous: PrivacyActionState,
  formData: FormData,
): Promise<PrivacyActionState> {
  try {
    const input = createDataSubjectRequestSchema.parse({
      requestType: "delete_organization",
      confirmation: formData.get("confirmation"),
    });
    await (await currentControlPlaneClient()).createPrivacyRequest(input);
    revalidatePath("/app/settings/privacy");
    return {
      status: "success",
      message: "Deletion verified and queued. Access will end when preparation completes.",
    };
  } catch (error) {
    return failure(error);
  }
}
