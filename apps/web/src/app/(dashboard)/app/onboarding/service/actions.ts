"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { createServiceRequestSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export type CreateServiceActionResult =
  | { ok: true; serviceSlug: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function createServiceAction(input: unknown): Promise<CreateServiceActionResult> {
  const parsed = createServiceRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Review the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const client = await currentControlPlaneClient();
    const service = await client.createService(parsed.data);
    revalidatePath("/app", "layout");
    return { ok: true, serviceSlug: service.slug };
  } catch (error) {
    if (error instanceof ControlPlaneError) {
      return { ok: false, message: error.problem.detail ?? error.problem.title };
    }
    return { ok: false, message: "The service could not be created. Please try again." };
  }
}
