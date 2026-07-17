"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { createAgentRequestSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export type RegisterAgentActionResult =
  | {
      ok: true;
      credential: { token: string; expiresAt: string };
      agentId: string;
    }
  | { ok: false; message: string };

export async function registerAgentAction(
  serviceSlug: string,
  input: unknown,
): Promise<RegisterAgentActionResult> {
  const parsed = createAgentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid agent settings" };
  }
  try {
    const client = await currentControlPlaneClient();
    const result = await client.createAgent(serviceSlug, parsed.data);
    revalidatePath(`/app/${serviceSlug}/agents`);
    revalidatePath(`/app/${serviceSlug}/overview`);
    return {
      ok: true,
      agentId: result.agent.id,
      credential: { token: result.credential.token, expiresAt: result.credential.expiresAt },
    };
  } catch (error) {
    if (error instanceof ControlPlaneError) {
      return { ok: false, message: error.problem.detail ?? error.problem.title };
    }
    return { ok: false, message: "The capture agent could not be registered. Try again." };
  }
}
