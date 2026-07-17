"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import {
  inviteMemberRequestSchema,
  transferOwnershipRequestSchema,
  updateMemberRoleRequestSchema,
  updateMemberStatusRequestSchema,
} from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentControlPlaneClient } from "@/services/control-plane";

export interface MemberActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function actionFailure(error: unknown): MemberActionState {
  if (error instanceof ControlPlaneError) {
    return {
      status: "error",
      message: error.problem.detail ?? "The request could not be completed.",
    };
  }
  if (error instanceof z.ZodError) {
    return { status: "error", message: "Review the submitted values and try again." };
  }
  return { status: "error", message: "An unexpected error occurred. Try again." };
}

export async function inviteMember(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  try {
    const input = inviteMemberRequestSchema.parse({
      email: formData.get("email"),
      role: formData.get("role"),
      expiresInDays: Number(formData.get("expiresInDays")),
    });
    await (await currentControlPlaneClient()).inviteMember(input);
    revalidatePath("/app/settings/members");
    return { status: "success", message: `Invitation sent to ${input.email}.` };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateMemberRole(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  try {
    const membershipId = z.uuid().parse(formData.get("membershipId"));
    const input = updateMemberRoleRequestSchema.parse({ role: formData.get("role") });
    await (await currentControlPlaneClient()).updateMemberRole(membershipId, input);
    revalidatePath("/app/settings/members");
    return { status: "success", message: "Member role updated." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateMemberStatus(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  try {
    const membershipId = z.uuid().parse(formData.get("membershipId"));
    const input = updateMemberStatusRequestSchema.parse({ status: formData.get("status") });
    await (await currentControlPlaneClient()).updateMemberStatus(membershipId, input);
    revalidatePath("/app/settings/members");
    return {
      status: "success",
      message: input.status === "active" ? "Member access restored." : "Member access suspended.",
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function transferOwnership(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  try {
    const input = transferOwnershipRequestSchema.parse({
      targetMembershipId: formData.get("targetMembershipId"),
    });
    await (await currentControlPlaneClient()).transferOwnership(input);
    revalidatePath("/app/settings/members");
    return { status: "success", message: "Organization ownership transferred." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function resendInvitation(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  try {
    const invitationId = z.uuid().parse(formData.get("invitationId"));
    await (await currentControlPlaneClient()).resendInvitation(invitationId);
    revalidatePath("/app/settings/members");
    return { status: "success", message: "Invitation resent." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function revokeInvitation(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  try {
    const invitationId = z.uuid().parse(formData.get("invitationId"));
    await (await currentControlPlaneClient()).revokeInvitation(invitationId);
    revalidatePath("/app/settings/members");
    return { status: "success", message: "Invitation revoked." };
  } catch (error) {
    return actionFailure(error);
  }
}
