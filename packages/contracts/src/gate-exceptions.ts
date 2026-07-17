import { z } from "zod";

export const gateImpactPathParamsSchema = z.strictObject({ gateImpactId: z.uuid() });
export const gateExceptionPathParamsSchema = z.strictObject({ gateExceptionId: z.uuid() });
export const requestGateExceptionSchema = z.strictObject({
  reason: z.string().trim().min(10).max(2_000),
  validUntil: z.iso.datetime(),
});
export const gateExceptionSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "approved", "used", "revoked", "expired"]),
  behaviorLabel: z.string(),
  candidateImageDigest: z.string(),
  reason: z.string(),
  requestedByMembershipId: z.uuid(),
  approvedByMembershipId: z.uuid().nullable(),
  validFrom: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  approvedAt: z.iso.datetime().nullable(),
  usedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type GateException = z.infer<typeof gateExceptionSchema>;
export const gateExceptionListSchema = z.object({ data: z.array(gateExceptionSchema) });
