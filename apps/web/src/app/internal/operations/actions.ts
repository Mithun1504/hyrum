"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { createSupportGrantSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentControlPlaneClient } from "@/services/control-plane";

export interface OperationActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const failure = (error: unknown): OperationActionState => {
  if (error instanceof ControlPlaneError) {
    return { status: "error", message: error.problem.detail ?? "The operation failed." };
  }
  if (error instanceof z.ZodError)
    return { status: "error", message: "Review the submitted values." };
  return { status: "error", message: "An unexpected error occurred." };
};

export async function requestSupportGrant(
  _previous: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  try {
    const input = createSupportGrantSchema.parse({
      organizationId: formData.get("organizationId"),
      reason: formData.get("reason"),
      ticketReference: formData.get("ticketReference"),
      durationMinutes: Number(formData.get("durationMinutes")),
      scopes: ["organization:read", "service:read", "ledger:read", "report:read", "audit:read"],
    });
    const grant = await (await currentControlPlaneClient()).createSupportGrant(input);
    revalidatePath("/internal/operations");
    return { status: "success", message: `Grant ${grant.id} awaits second-operator approval.` };
  } catch (error) {
    return failure(error);
  }
}

export async function approveSupportGrantAction(
  _previous: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  try {
    const grantId = z.uuid().parse(formData.get("grantId"));
    const grant = await (await currentControlPlaneClient()).approveSupportGrant(grantId);
    revalidatePath("/internal/operations");
    return {
      status: "success",
      message: `Grant approved until ${new Date(grant.expiresAt).toLocaleString()}.`,
    };
  } catch (error) {
    return failure(error);
  }
}
