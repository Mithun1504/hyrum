import { z } from "zod";

export const gatePolicySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.number().int().positive(),
  t1Action: z.enum(["block", "warn", "note"]),
  t2Action: z.enum(["warn", "note", "pass"]),
  t3Action: z.enum(["note", "pass"]),
  assertionAction: z.enum(["block", "warn", "note"]),
  flakyAction: z.enum(["warn", "note", "pass"]),
  minimumStableAttempts: z.number().int().min(2).max(10),
  activatedAt: z.iso.datetime(),
});
export type GatePolicy = z.infer<typeof gatePolicySchema>;

export const updateGatePolicySchema = z.strictObject({
  t1Action: z.enum(["block", "warn", "note"]),
  t2Action: z.enum(["warn", "note", "pass"]),
  t3Action: z.enum(["note", "pass"]),
  assertionAction: z.enum(["block", "warn", "note"]),
  flakyAction: z.enum(["warn", "note", "pass"]),
  minimumStableAttempts: z.number().int().min(2).max(10),
  expectedVersion: z.number().int().positive(),
});
export type UpdateGatePolicy = z.infer<typeof updateGatePolicySchema>;
