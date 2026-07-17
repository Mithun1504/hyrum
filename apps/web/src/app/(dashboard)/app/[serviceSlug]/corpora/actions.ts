"use server";

import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export async function buildCorpusAction(serviceSlug: string) {
  const result = await (await currentControlPlaneClient()).buildCorpus(serviceSlug);
  revalidatePath(`/app/${serviceSlug}/corpora`);
  return result;
}

export async function corpusAccessAction(corpusId: string) {
  return (await currentControlPlaneClient()).corpusAccess(corpusId);
}
