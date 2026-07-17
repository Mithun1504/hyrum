import { z } from "zod";

export const dataSubjectRequestTypeSchema = z.enum([
  "export",
  "delete_organization",
  "delete_user",
]);
export const dataSubjectRequestSchema = z.object({
  id: z.uuid(),
  requestType: dataSubjectRequestTypeSchema,
  status: z.enum(["pending", "verified", "processing", "completed", "failed", "cancelled"]),
  requestedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  failureCode: z.string().nullable(),
  exportAvailable: z.boolean(),
});
export const dataSubjectRequestListSchema = z.object({ data: z.array(dataSubjectRequestSchema) });
export const createDataSubjectRequestSchema = z.strictObject({
  requestType: z.enum(["export", "delete_organization"]),
  confirmation: z.string().trim().min(1).max(100),
});
export const dataSubjectRequestPathSchema = z.object({ requestId: z.uuid() });
export const dataSubjectDownloadSchema = z.object({
  url: z.url(),
  expiresInSeconds: z.number().int(),
});

export type DataSubjectRequest = z.infer<typeof dataSubjectRequestSchema>;
export type CreateDataSubjectRequest = z.infer<typeof createDataSubjectRequestSchema>;
