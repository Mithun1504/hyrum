"use server";

import type { UpdateGatePolicy } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export async function updateGatePolicyAction(serviceSlug: string, input: UpdateGatePolicy) {
  const result = await (await currentControlPlaneClient()).updateGatePolicy(serviceSlug, input);
  revalidatePath(`/app/${serviceSlug}/policy`);
  return result;
}
