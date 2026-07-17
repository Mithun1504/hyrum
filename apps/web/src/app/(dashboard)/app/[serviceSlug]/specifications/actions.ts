"use server";

import { ControlPlaneError } from "@hyrum/api-client";
import { uploadSpecificationRequestSchema } from "@hyrum/contracts";
import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export type UploadSpecificationActionResult =
  | { ok: true; specificationId: string; operationCount: number; created: boolean }
  | { ok: false; message: string };

export async function uploadSpecificationAction(
  serviceSlug: string,
  input: unknown,
): Promise<UploadSpecificationActionResult> {
  const parsed = uploadSpecificationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid specification" };
  }
  try {
    const client = await currentControlPlaneClient();
    const result = await client.uploadSpecification(serviceSlug, parsed.data);
    revalidatePath(`/app/${serviceSlug}`, "layout");
    return {
      ok: true,
      specificationId: result.specification.id,
      operationCount: result.specification.operations.length,
      created: result.created,
    };
  } catch (error) {
    if (error instanceof ControlPlaneError) {
      return { ok: false, message: error.problem.detail ?? error.problem.title };
    }
    return { ok: false, message: "The specification could not be uploaded. Please try again." };
  }
}
