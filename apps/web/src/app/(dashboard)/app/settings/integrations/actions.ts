"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { configureSlackInstallationSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentControlPlaneClient } from "@/services/control-plane";

export interface IntegrationActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function startSlackOAuthAction(formData: FormData): Promise<never> {
  const channelId = z.string().trim().min(1).max(100).parse(formData.get("channelId"));
  const result = await (await currentControlPlaneClient()).slackOAuthUrl({ channelId });
  redirect(result.url);
}

export async function configureSlackAction(
  _previous: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  try {
    const input = configureSlackInstallationSchema.parse({
      teamId: formData.get("teamId"),
      teamName: formData.get("teamName"),
      channelId: formData.get("channelId"),
    });
    await (await currentControlPlaneClient()).configureSlack(input);
    revalidatePath("/app/settings/integrations");
    return { status: "success", message: "Slack routing is active." };
  } catch (error) {
    if (error instanceof ControlPlaneError) {
      return { status: "error", message: error.problem.detail ?? "Slack could not be configured." };
    }
    if (error instanceof z.ZodError) {
      return { status: "error", message: "Enter the Slack workspace and channel identifiers." };
    }
    return { status: "error", message: "Slack could not be configured." };
  }
}
