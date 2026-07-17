"use server";

import type {
  CreateAssertionRequest,
  ExtendAssertionRequest,
  ResolveAssertionRequest,
  ScheduleBreakingChangeRequest,
} from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export async function createAssertionAction(serviceSlug: string, input: CreateAssertionRequest) {
  const result = await (await currentControlPlaneClient()).createAssertion(serviceSlug, input);
  revalidatePath(`/app/${serviceSlug}/assertions`);
  return result;
}

export async function resolveAssertionAction(
  serviceSlug: string,
  assertionId: string,
  input: ResolveAssertionRequest,
) {
  await (await currentControlPlaneClient()).resolveAssertion(assertionId, input);
  revalidatePath(`/app/${serviceSlug}/assertions`);
}

export async function extendAssertionAction(
  serviceSlug: string,
  assertionId: string,
  input: ExtendAssertionRequest,
) {
  const result = await (await currentControlPlaneClient()).extendAssertion(assertionId, input);
  revalidatePath(`/app/${serviceSlug}/assertions`);
  return result;
}

export async function scheduleBreakingChangeAction(
  serviceSlug: string,
  assertionId: string,
  input: ScheduleBreakingChangeRequest,
) {
  const result = await (await currentControlPlaneClient()).scheduleBreakingChange(
    assertionId,
    input,
  );
  revalidatePath(`/app/${serviceSlug}/assertions`);
  return result;
}

export async function requestProductDraftAction(
  serviceSlug: string,
  planId: string,
  draftType: "spec_patch" | "customer_notice",
) {
  const result = await (await currentControlPlaneClient()).requestProductDraft(planId, draftType);
  revalidatePath(`/app/${serviceSlug}/assertions`);
  return result;
}

export async function requestAssertionSpecPatchAction(serviceSlug: string, assertionId: string) {
  const result = await (await currentControlPlaneClient()).requestAssertionSpecPatch(assertionId);
  revalidatePath(`/app/${serviceSlug}/assertions`);
  return result;
}

export async function reviewProductDraftAction(
  serviceSlug: string,
  draftId: string,
  decision: "accept" | "reject",
) {
  await (await currentControlPlaneClient()).reviewProductDraft(draftId, decision);
  revalidatePath(`/app/${serviceSlug}/assertions`);
}
