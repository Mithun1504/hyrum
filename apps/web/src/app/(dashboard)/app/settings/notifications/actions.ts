"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { notificationEventTypeSchema, updateNotificationPreferenceSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentControlPlaneClient } from "@/services/control-plane";

export interface NotificationPreferenceActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function saveNotificationPreference(
  _previous: NotificationPreferenceActionState,
  formData: FormData,
): Promise<NotificationPreferenceActionState> {
  try {
    const eventType = notificationEventTypeSchema.parse(formData.get("eventType"));
    const rawMutedUntil = String(formData.get("mutedUntil") ?? "").trim();
    const input = updateNotificationPreferenceSchema.parse({
      inAppEnabled: formData.get("inAppEnabled") === "true",
      digestEnabled: formData.get("digestEnabled") === "true",
      mutedUntil: rawMutedUntil ? new Date(rawMutedUntil).toISOString() : null,
    });
    await (await currentControlPlaneClient()).updateNotificationPreference(eventType, input);
    revalidatePath("/app", "layout");
    return { status: "success", message: "Preference saved." };
  } catch (error) {
    if (error instanceof ControlPlaneError) {
      return { status: "error", message: error.problem.detail ?? "Preference could not be saved." };
    }
    if (error instanceof z.ZodError || error instanceof RangeError) {
      return { status: "error", message: "Review the preference and mute date." };
    }
    return { status: "error", message: "Preference could not be saved." };
  }
}
