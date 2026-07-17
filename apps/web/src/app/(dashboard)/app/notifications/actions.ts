"use server";

import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export async function markNotificationReadAction(notificationId: string) {
  await (await currentControlPlaneClient()).markNotificationRead(notificationId);
  revalidatePath("/app", "layout");
}

export async function dismissNotificationAction(notificationId: string) {
  await (await currentControlPlaneClient()).dismissNotification(notificationId);
  revalidatePath("/app", "layout");
}
