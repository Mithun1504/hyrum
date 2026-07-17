import { z } from "zod";

export const assertionStatusSchema = z.enum([
  "active",
  "expiring",
  "expired",
  "resolved",
  "cancelled",
]);
export const assertionSchema = z.object({
  id: z.uuid(),
  apiServiceId: z.uuid(),
  behavior: z.object({ id: z.uuid(), label: z.string(), kind: z.string() }),
  sourceClaimId: z.uuid().nullable(),
  owner: z.object({ membershipId: z.uuid(), displayName: z.string(), email: z.string().email() }),
  reason: z.string(),
  status: assertionStatusSchema,
  scope: z.enum(["all_consumers", "selected_consumers"]),
  consumerIds: z.array(z.uuid()),
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  remindAt: z.iso.datetime().nullable(),
  resolution: z.enum(["documented", "extended", "deliberately_broken", "cancelled"]).nullable(),
  supersedesAssertionId: z.uuid().nullable(),
  breakingChangePlan: z
    .object({
      id: z.uuid(),
      status: z.enum(["draft", "scheduled", "communication_ready", "completed", "cancelled"]),
      plannedFor: z.iso.datetime(),
      communicationDueAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  updatedAt: z.iso.datetime(),
});
export type Assertion = z.infer<typeof assertionSchema>;
export const assertionListSchema = z.object({ data: z.array(assertionSchema) });
export const assertionQuerySchema = z.strictObject({ status: assertionStatusSchema.optional() });

export const createAssertionRequestSchema = z
  .strictObject({
    behaviorDefinitionId: z.uuid(),
    sourceClaimId: z.uuid().optional(),
    ownerMembershipId: z.uuid(),
    reason: z.string().trim().min(10).max(2_000),
    scope: z.enum(["all_consumers", "selected_consumers"]),
    consumerIds: z.array(z.uuid()).max(500).default([]),
    expiresAt: z.iso.datetime(),
    remindAt: z.iso.datetime().optional(),
  })
  .superRefine((value, context) => {
    const selected = value.scope === "selected_consumers";
    if (selected !== value.consumerIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["consumerIds"],
        message: selected
          ? "Select at least one consumer"
          : "All-consumer assertions cannot include consumer IDs",
      });
    }
    if (new Set(value.consumerIds).size !== value.consumerIds.length) {
      context.addIssue({
        code: "custom",
        path: ["consumerIds"],
        message: "Consumers must be unique",
      });
    }
  });
export type CreateAssertionRequest = z.infer<typeof createAssertionRequestSchema>;

export const assertionPathParamsSchema = z.strictObject({ assertionId: z.uuid() });
export const extendAssertionRequestSchema = z.strictObject({
  expiresAt: z.iso.datetime(),
  remindAt: z.iso.datetime().optional(),
  reason: z.string().trim().min(10).max(2_000),
  expectedUpdatedAt: z.iso.datetime(),
});
export type ExtendAssertionRequest = z.infer<typeof extendAssertionRequestSchema>;

export const scheduleBreakingChangeRequestSchema = z.strictObject({
  plannedFor: z.iso.datetime(),
  communicationDueAt: z.iso.datetime().optional(),
  reason: z.string().trim().min(10).max(2_000),
  expectedUpdatedAt: z.iso.datetime(),
});
export type ScheduleBreakingChangeRequest = z.infer<typeof scheduleBreakingChangeRequestSchema>;
export const resolveAssertionRequestSchema = z.strictObject({
  resolution: z.enum(["documented", "cancelled"]),
  reason: z.string().trim().min(10).max(2_000),
  expectedUpdatedAt: z.iso.datetime(),
});
export type ResolveAssertionRequest = z.infer<typeof resolveAssertionRequestSchema>;
export const breakingChangePlanSchema = z.object({
  id: z.uuid(),
  assertionId: z.uuid(),
  status: z.enum(["draft", "scheduled", "communication_ready", "completed", "cancelled"]),
  plannedFor: z.iso.datetime(),
  communicationDueAt: z.iso.datetime().nullable(),
  impactCount: z.number().int().nonnegative(),
});
