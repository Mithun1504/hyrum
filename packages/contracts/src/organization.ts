import { z } from "zod";

export const updateOrganizationRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    staleAfterDays: z.number().int().min(1).max(3650).optional(),
    defaultAssertionDays: z.number().int().min(1).max(3650).optional(),
    defaultReceiptTtlDays: z.number().int().min(1).max(365).optional(),
    notificationDigestEnabled: z.boolean().optional(),
    dataExportEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one organization setting is required",
  });
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;

export const updateRetentionRequestSchema = z.object({
  retentionDays: z.number().int().min(1).max(365),
});
export type UpdateRetentionRequest = z.infer<typeof updateRetentionRequestSchema>;
