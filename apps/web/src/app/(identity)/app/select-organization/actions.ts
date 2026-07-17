"use server";

import { switchToOrganization } from "@workos-inc/authkit-nextjs";
import { z } from "zod";

const organizationSelectionSchema = z.object({
  organizationId: z.string().min(1).max(255),
});

export async function selectOrganization(formData: FormData) {
  const { organizationId } = organizationSelectionSchema.parse({
    organizationId: formData.get("organizationId"),
  });
  await switchToOrganization(organizationId, { returnTo: "/app" });
}
