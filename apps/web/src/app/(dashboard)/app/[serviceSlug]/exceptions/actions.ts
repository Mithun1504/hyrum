"use server";

import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export async function requestGateExceptionAction(
  serviceSlug: string,
  gateImpactId: string,
  input: { reason: string; validUntil: string },
) {
  const result = await (await currentControlPlaneClient()).requestGateException(
    gateImpactId,
    input,
  );
  revalidatePath(`/app/${serviceSlug}/exceptions`);
  revalidatePath(`/app/${serviceSlug}/replays`);
  return result;
}

export async function approveGateExceptionAction(serviceSlug: string, gateExceptionId: string) {
  const result = await (await currentControlPlaneClient()).approveGateException(gateExceptionId);
  revalidatePath(`/app/${serviceSlug}/exceptions`);
  return result;
}
