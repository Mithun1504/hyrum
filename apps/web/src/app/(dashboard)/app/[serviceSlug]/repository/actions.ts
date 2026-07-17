"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { createRepositoryConnectionSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentControlPlaneClient } from "@/services/control-plane";

export interface RepositoryActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function createRepositoryConnectionAction(
  serviceSlug: string,
  _previous: RepositoryActionState,
  formData: FormData,
): Promise<RepositoryActionState> {
  try {
    const input = createRepositoryConnectionSchema.parse({
      githubRepositoryId: formData.get("githubRepositoryId"),
      specPath: formData.get("specPath"),
      workflowPath: formData.get("workflowPath"),
      baseImageBuildRef: formData.get("baseImageBuildRef"),
      candidateImageBuildRef: formData.get("candidateImageBuildRef"),
    });
    await (await currentControlPlaneClient()).createRepositoryConnection(serviceSlug, input);
    revalidatePath(`/app/${serviceSlug}/repository`);
    return { status: "success", message: "Repository connected to this service." };
  } catch (error) {
    if (error instanceof ControlPlaneError) {
      return {
        status: "error",
        message: error.problem.detail ?? "Repository could not be connected.",
      };
    }
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: "Use normalized repository-relative paths and complete every field.",
      };
    }
    return { status: "error", message: "Repository could not be connected." };
  }
}
