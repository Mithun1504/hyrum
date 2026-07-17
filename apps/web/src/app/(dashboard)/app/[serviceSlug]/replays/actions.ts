"use server";

import type { CreateReplayRunRequest } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export async function createReplayAction(serviceSlug: string, input: CreateReplayRunRequest) {
  const result = await (await currentControlPlaneClient()).createReplay(serviceSlug, input);
  revalidatePath(`/app/${serviceSlug}/replays`);
  return result;
}

export async function requestReplayImpactExplanationAction(
  serviceSlug: string,
  replayRunId: string,
) {
  const result = await (await currentControlPlaneClient()).requestReplayImpactExplanation(
    serviceSlug,
    replayRunId,
  );
  revalidatePath(`/app/${serviceSlug}/replays/${replayRunId}`);
  return result;
}
