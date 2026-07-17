import { z } from "zod";

export const evidenceTierSchema = z.enum(["t1", "t2", "t3"]);
export const ledgerEntrySchema = z.object({
  id: z.uuid(),
  dependencyClaimId: z.uuid(),
  consumer: z.object({ id: z.uuid(), displayAlias: z.string() }),
  operation: z.object({
    method: z.string(),
    path: z.string(),
    displayName: z.string().nullable(),
  }),
  behavior: z.object({
    id: z.uuid(),
    kind: z.enum(["shape", "ordering", "error_template"]),
    label: z.string(),
  }),
  tier: evidenceTierSchema,
  claimStatus: z.enum(["proposed", "active", "disputed", "dismissed", "stale", "superseded"]),
  deterministicEligible: z.boolean(),
  supportCount: z.string().regex(/^\d+$/),
  reviewState: z.enum(["unreviewed", "confirmed", "demoted", "promoted", "dismissed"]),
  freshnessStatus: z.enum(["fresh", "aging", "stale"]),
  firstDetectedAt: z.iso.datetime(),
  lastObservedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  receipt: z
    .object({
      id: z.uuid(),
      type: z.enum(["t1_echo", "t2_pattern", "exposure", "replay_delta", "assertion"]),
      availability: z.enum(["pending", "available", "expired", "quarantined", "deleted", "failed"]),
      expiresAt: z.iso.datetime(),
    })
    .nullable(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerListSchema = z.object({
  data: z.array(ledgerEntrySchema),
  page: z.object({ hasMore: z.boolean(), nextCursor: z.string().nullable() }),
});
export const ledgerQuerySchema = z.strictObject({
  tier: evidenceTierSchema.optional(),
  search: z.string().trim().max(100).optional(),
  cursor: z.string().max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const ledgerReviewPathParamsSchema = z.strictObject({ ledgerEntryId: z.uuid() });
export const ledgerReviewRequestSchema = z
  .strictObject({
    decision: z.enum(["confirmed", "demoted", "promoted", "dismissed"]),
    toTier: evidenceTierSchema.optional(),
    reason: z.string().trim().min(3).max(2_000),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .superRefine((input, context) => {
    const tierChanging = input.decision === "demoted" || input.decision === "promoted";
    if (tierChanging !== Boolean(input.toTier)) {
      context.addIssue({
        code: "custom",
        path: ["toTier"],
        message: tierChanging ? "Target tier is required" : "Target tier is not allowed",
      });
    }
  });
export type LedgerReviewRequest = z.infer<typeof ledgerReviewRequestSchema>;
export const ledgerReviewResponseSchema = z.object({
  id: z.uuid(),
  reviewState: z.enum(["confirmed", "demoted", "promoted", "dismissed"]),
  updatedAt: z.iso.datetime(),
});
export const receiptPathParamsSchema = z.strictObject({ receiptId: z.uuid() });
export const receiptAccessSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
