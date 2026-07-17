import { z } from "zod";
import { permissionSchema } from "./auth";

export const createSupportGrantSchema = z.strictObject({
  organizationId: z.uuid(),
  reason: z.string().trim().min(20).max(500),
  ticketReference: z.string().trim().min(3).max(100),
  scopes: z.array(permissionSchema).min(1).max(20),
  durationMinutes: z.number().int().min(5).max(60),
});
export const supportGrantPathSchema = z.strictObject({ grantId: z.uuid() });
export const supportGrantSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  operatorId: z.uuid(),
  approvedByOperatorId: z.uuid().nullable(),
  reason: z.string(),
  ticketReference: z.string(),
  scopes: z.array(permissionSchema),
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export const platformHealthSchema = z.object({
  jobs: z.object({ pending: z.number().int(), running: z.number().int(), dead: z.number().int() }),
  deletingOrganizations: z.number().int(),
});
export type CreateSupportGrant = z.infer<typeof createSupportGrantSchema>;
export type SupportGrant = z.infer<typeof supportGrantSchema>;
export type PlatformHealth = z.infer<typeof platformHealthSchema>;
