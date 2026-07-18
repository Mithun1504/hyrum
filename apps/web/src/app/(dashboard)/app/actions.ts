"use server";

import { type SpecDraft, specDraftResponseSchema } from "@hyrum/contracts";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { controlPlaneBaseUrl, createControlPlane } from "@/services/control-plane";

const assertionInputSchema = z.object({
  behavior_id: z.string().uuid(),
  claim_id: z.string().uuid().optional(),
  reason: z.string().trim().min(1, "Add a reason before pinning.").max(2_000),
  expires_at: z.string().date(),
});

export type MutationState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type SpecDraftState = MutationState & {
  source?: "model" | "fallback";
  responseId?: string | null;
  model?: string;
  promptVersion?: string;
  draft?: SpecDraft;
};

export async function pinAssertionAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = assertionInputSchema.safeParse({
    behavior_id: formData.get("behavior_id"),
    claim_id: formData.get("claim_id") || undefined,
    reason: formData.get("reason"),
    expires_at: formData.get("expires_at"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Assertion input is invalid.",
    };
  }
  try {
    const { accessToken } = await withAuth();
    if (!accessToken) {
      return { status: "error", message: "Your session expired. Sign in again before pinning." };
    }
    const assertion = await createControlPlane(accessToken).pinAssertion({
      behavior_id: parsed.data.behavior_id,
      claim_id: parsed.data.claim_id,
      reason: parsed.data.reason,
      expires_at: `${parsed.data.expires_at}T23:59:59.000Z`,
    });
    revalidatePath("/app");
    return {
      status: "success",
      message: `Assertion ${assertion.id.slice(0, 8)} pinned and added to replay enforcement.`,
    };
  } catch (error) {
    return { status: "error", message: actionError("Assertion could not be pinned", error) };
  }
}

export async function draftSpecAction(
  _previous: SpecDraftState,
  formData: FormData,
): Promise<SpecDraftState> {
  const assertionId = z.string().uuid().safeParse(formData.get("assertion_id"));
  if (!assertionId.success) return { status: "error", message: "Select a valid assertion first." };
  try {
    const { accessToken } = await withAuth();
    if (!accessToken) {
      return {
        status: "error",
        message: "Your session expired. Sign in again before drafting a spec change.",
      };
    }
    const response = await fetch(
      `${controlPlaneBaseUrl}/v1/assertions/${assertionId.data}/spec-draft`,
      {
        method: "POST",
        headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error(`Control plane returned ${response.status}`);
    const result = specDraftResponseSchema.parse(await response.json());
    return {
      status: "success",
      message: `Spec draft generated from ${result.source} evidence processing.`,
      source: result.source,
      responseId: result.response_id,
      model: result.model,
      promptVersion: result.prompt_version,
      draft: result.draft,
    };
  } catch (error) {
    return { status: "error", message: actionError("Spec draft could not be generated", error) };
  }
}

function actionError(prefix: string, error: unknown) {
  const detail =
    error instanceof Error
      ? error.message.replace(/[\r\n]+/g, " ").slice(0, 180)
      : "Control plane request failed";
  return `${prefix}. ${detail}. Retry after checking the control plane.`;
}
