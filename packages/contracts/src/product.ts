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
  endpoint: z.string(),
  consumer_alias: z.string(),
  consumer_stable_id: z.string(),
  observation_count: z.number().int().nonnegative(),
  session_count: z.number().int().nonnegative(),
  owner: z.string().nullable(),
  receipt_digest: z.string().nullable(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const paginationMetaSchema = z.object({
  next_cursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});
export const ledgerListResponseSchema = paginationMetaSchema.extend({
  entries: z.array(ledgerEntrySchema),
});
export const consumerListResponseSchema = paginationMetaSchema.extend({
  consumers: z.array(consumerSchema),
});

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
  resolution_type: z.enum(["documented", "extended", "scheduled_break"]).nullable(),
  resolution_reason: z.string().nullable(),
  resolved_by: z.string().nullable(),
  resolved_at: isoDateTimeSchema.nullable(),
  customer_notice: z
    .object({
      subject: z.string(),
      summary: z.string(),
      body: z.string(),
      effective_at: isoDateTimeSchema,
      impacted_consumers: z.array(
        z.object({
          consumer_id: z.uuid(),
          display_alias: z.string(),
          tier: evidenceTierSchema,
          endpoints: z.array(z.string()),
          observation_count: z.number().int().nonnegative().nullable(),
        }),
      ),
    })
    .nullable(),
});
export type Assertion = z.infer<typeof assertionSchema>;

export const assertionListItemSchema = assertionSchema.extend({
  owner_name: z.string(),
  behavior_title: z.string(),
});
export type AssertionListItem = z.infer<typeof assertionListItemSchema>;

export const resolveAssertionRequestSchema = z
  .discriminatedUnion("resolution", [
    z.object({
      resolution: z.literal("documented"),
      reason: z.string().min(1).max(2_000),
    }),
    z.object({
      resolution: z.literal("extend"),
      reason: z.string().min(1).max(2_000),
      expires_at: isoDateTimeSchema,
    }),
    z.object({
      resolution: z.literal("schedule_break"),
      reason: z.string().min(1).max(2_000),
      break_at: isoDateTimeSchema,
    }),
  ])
  .refine(
    (value) =>
      value.resolution === "documented" ||
      new Date(value.resolution === "extend" ? value.expires_at : value.break_at) > new Date(),
    { message: "Resolution date must be in the future" },
  );
export type ResolveAssertionRequest = z.infer<typeof resolveAssertionRequestSchema>;

export const overrideDependencyClaimRequestSchema = z
  .object({
    tier: evidenceTierSchema.nullable(),
    reason: z.string().min(1).max(2_000),
  })
  .strict();
export type OverrideDependencyClaimRequest = z.infer<typeof overrideDependencyClaimRequestSchema>;

export const claimOverrideResponseSchema = z.object({
  claim_id: z.uuid(),
  effective_tier: evidenceTierSchema,
  human_override_tier: evidenceTierSchema.nullable(),
  overridden_by: z.string().nullable(),
  override_reason: z.string().nullable(),
  overridden_at: isoDateTimeSchema.nullable(),
});

export const assertionExpiryJobPayloadSchema = z.object({ assertion_id: z.uuid() }).strict();
export type AssertionExpiryJobPayload = z.infer<typeof assertionExpiryJobPayloadSchema>;

export const corpusItemSchema = z.object({
  id: z.uuid(),
  corpus_id: z.uuid(),
  case_id: z.string(),
  operation_id: z.uuid().nullable(),
  consumer_id: z.uuid().nullable(),
  coverage_class: z.string(),
  object_key: z.string(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  enabled: z.boolean(),
  priority: z.number().int().positive(),
  request_metadata: z.record(z.string(), z.unknown()),
});
export type CorpusItem = z.infer<typeof corpusItemSchema>;
export const replayCorpusSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  object_key: z.string(),
  fixture_digest: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .nullable(),
  fixture_object_key: z.string().nullable(),
  stubs_object_key: z.string().nullable(),
  curation_status: z.enum(["draft", "ready", "archived"]),
  created_by: z.string().nullable(),
  items: z.array(corpusItemSchema),
});
export type ReplayCorpus = z.infer<typeof replayCorpusSchema>;
export const prepareCorpusUploadRequestSchema = z
  .object({
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    size_bytes: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    content_type: z.string().min(1).max(200),
  })
  .strict();
export const prepareCorpusUploadResponseSchema = z
  .object({
    object_key: z.string(),
    upload_url: z.url(),
    expires_at: isoDateTimeSchema,
    headers: z.record(z.string(), z.string()),
  })
  .strict();
export type PrepareCorpusUploadRequest = z.infer<typeof prepareCorpusUploadRequestSchema>;
export type PrepareCorpusUploadResponse = z.infer<typeof prepareCorpusUploadResponseSchema>;
export const createReplayCorpusRequestSchema = z.object({
  version: z.string().min(1).max(80),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  object_key: z.string().min(1).max(500),
  fixture_digest: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .nullable()
    .optional(),
  fixture_object_key: z.string().min(1).max(500).nullable().optional(),
  stubs_object_key: z.string().min(1).max(500).nullable().optional(),
});
export type CreateReplayCorpusRequest = z.infer<typeof createReplayCorpusRequestSchema>;
export const createCorpusItemRequestSchema = corpusItemSchema.omit({
  id: true,
  corpus_id: true,
});
export type CreateCorpusItemRequest = z.infer<typeof createCorpusItemRequestSchema>;
export const updateCorpusItemRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    priority: z.number().int().positive().optional(),
  })
  .refine(
    (value) => value.enabled !== undefined || value.priority !== undefined,
    "At least one field is required",
  );
export type UpdateCorpusItemRequest = z.infer<typeof updateCorpusItemRequestSchema>;
export const updateReplayCorpusRequestSchema = z.object({
  curation_status: z.enum(["draft", "ready", "archived"]),
});
export type UpdateReplayCorpusRequest = z.infer<typeof updateReplayCorpusRequestSchema>;

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
    expected_version: z.number().int().positive().optional(),
    block_tiers: z.array(z.literal("T1")).max(1).default(["T1"]),
    warn_tiers: z.array(evidenceTierSchema).default(["T2"]),
  })
  .strict()
  .refine((policy) => !policy.block_tiers.some((tier) => policy.warn_tiers.includes(tier)), {
    message: "A tier cannot both block and warn",
    path: ["warn_tiers"],
  });
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

export const workspaceSummarySchema = z.object({
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    region: z.string(),
    retention_days: z.number().int().positive(),
  }),
  capture: z.object({
    endpoint_count: z.number().int().nonnegative(),
    consumer_count: z.number().int().nonnegative(),
    sessions_24h: z.number().int().nonnegative(),
    evidence_events_24h: z.number().int().nonnegative(),
  }),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const progressEventListSchema = z.object({
  events: z.array(progressEventSchema),
});
