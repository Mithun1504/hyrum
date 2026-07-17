import { z } from "zod";
import {
  behaviorKindSchema,
  evidenceTierSchema,
  isoDateTimeSchema,
  progressEventTopicSchema,
} from "./common";

export const consumerSchema = z.object({
  id: z.uuid(),
  stable_id: z.string(),
  display_alias: z.string(),
  last_seen_at: isoDateTimeSchema.nullable(),
});
export type Consumer = z.infer<typeof consumerSchema>;

export const uploadApiSpecRequestSchema = z
  .object({
    version: z.string().min(1).max(200),
    document: z.record(z.string(), z.unknown()),
    active: z.boolean().default(true),
  })
  .strict();
export type UploadApiSpecRequest = z.infer<typeof uploadApiSpecRequestSchema>;

export const apiSpecSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  digest: z.string(),
  active: z.boolean(),
});
export type ApiSpec = z.infer<typeof apiSpecSchema>;

export const ledgerEntrySchema = z.object({
  id: z.uuid(),
  claim_id: z.uuid(),
  behavior_id: z.uuid(),
  consumer_id: z.uuid(),
  operation_id: z.uuid().nullable(),
  kind: behaviorKindSchema,
  tier: evidenceTierSchema,
  state: z.enum(["active", "stale", "dismissed"]),
  title: z.string(),
  last_seen_at: isoDateTimeSchema,
  freshness_until: isoDateTimeSchema,
  receipt_id: z.uuid().nullable(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const receiptSchema = z.object({
  id: z.uuid(),
  behavior_id: z.uuid().nullable(),
  consumer_id: z.uuid().nullable(),
  operation_id: z.uuid().nullable(),
  object_key: z.string().nullable(),
  digest: z.string(),
  redaction_version: z.string(),
  sequence_start: z.number().int().nonnegative(),
  sequence_end: z.number().int().nonnegative(),
  excerpt: z.unknown(),
  expires_at: isoDateTimeSchema,
});
export type Receipt = z.infer<typeof receiptSchema>;

export const pinAssertionRequestSchema = z
  .object({
    behavior_id: z.uuid(),
    claim_id: z.uuid().optional(),
    reason: z.string().min(1).max(2_000),
    expires_at: isoDateTimeSchema.optional(),
    policy: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type PinAssertionRequest = z.infer<typeof pinAssertionRequestSchema>;

export const assertionSchema = z.object({
  id: z.uuid(),
  behavior_id: z.uuid(),
  claim_id: z.uuid().nullable(),
  owner_id: z.string(),
  reason: z.string(),
  status: z.enum(["active", "expired", "resolved"]),
  expires_at: isoDateTimeSchema,
});
export type Assertion = z.infer<typeof assertionSchema>;

export const assertionExpiryJobPayloadSchema = z.object({ assertion_id: z.uuid() }).strict();
export type AssertionExpiryJobPayload = z.infer<typeof assertionExpiryJobPayloadSchema>;

export const openApiPatchValueSchema = z
  .object({
    type: z.enum(["string", "number", "integer", "boolean", "object", "array"]),
    description: z.string().nullable(),
    format: z.string().nullable(),
  })
  .strict();

export const openApiPatchOperationSchema = z
  .object({
    op: z.enum(["add", "replace"]),
    path: z.string().startsWith("/paths/"),
    value: openApiPatchValueSchema,
  })
  .strict();

export const specDraftSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    rationale: z.string(),
    receiptIds: z.array(z.string()),
    uncertainty: z.number().min(0).max(1),
    abstained: z.boolean(),
    abstentionReason: z.string().nullable(),
    openapiPatch: z.array(openApiPatchOperationSchema),
  })
  .strict();
export type SpecDraft = z.infer<typeof specDraftSchema>;

export const specDraftResponseSchema = z
  .object({
    source: z.enum(["model", "fallback"]),
    response_id: z.string().nullable(),
    model: z.string(),
    prompt_version: z.string(),
    draft: specDraftSchema,
  })
  .strict();
export type SpecDraftResponse = z.infer<typeof specDraftResponseSchema>;

export const gatePolicySchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  block_tiers: z.array(z.literal("T1")).max(1),
  warn_tiers: z.array(evidenceTierSchema),
  active: z.boolean(),
});
export type GatePolicy = z.infer<typeof gatePolicySchema>;

export const upsertGatePolicyRequestSchema = z
  .object({
    block_tiers: z.array(z.literal("T1")).max(1).default(["T1"]),
    warn_tiers: z.array(evidenceTierSchema).default(["T2"]),
  })
  .strict();
export type UpsertGatePolicyRequest = z.infer<typeof upsertGatePolicyRequestSchema>;

export const progressEventSchema = z.object({
  id: z.number().int().positive(),
  organization_id: z.uuid(),
  topic: progressEventTopicSchema,
  resource_id: z.string().nullable(),
  payload: z.unknown(),
  created_at: isoDateTimeSchema,
});
export type ProgressEvent = z.infer<typeof progressEventSchema>;
