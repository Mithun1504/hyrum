import { z } from "zod";

export const agentStatusSchema = z.enum(["pending", "online", "degraded", "offline", "revoked"]);
export const agentAdapterTypeSchema = z.enum([
  "ndjson",
  "http_proxy",
  "kong",
  "envoy_als",
  "log_tap",
]);
export const machineScopeSchema = z.enum(["config:read", "heartbeat:write", "ingestion:write"]);
export type MachineScope = z.infer<typeof machineScopeSchema>;

export const createAgentRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  environmentId: z.uuid(),
  externalInstanceKey: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
  adapterType: agentAdapterTypeSchema,
  agentVersion: z.string().trim().min(1).max(64),
  extractorReleaseId: z.uuid(),
  redactionPolicyVersionId: z.uuid(),
  samplingPolicyVersionId: z.uuid(),
  credentialExpiresInDays: z.number().int().min(1).max(365).default(90),
});
export type CreateAgentRequest = z.infer<typeof createAgentRequestSchema>;

export const agentSchema = z.object({
  id: z.uuid(),
  apiServiceId: z.uuid(),
  environmentId: z.uuid(),
  name: z.string(),
  externalInstanceKey: z.string(),
  status: agentStatusSchema,
  adapterType: agentAdapterTypeSchema,
  agentVersion: z.string(),
  extractorReleaseId: z.uuid(),
  redactionPolicyVersionId: z.uuid(),
  samplingPolicyVersionId: z.uuid(),
  configRevision: z.number().int().positive(),
  lastSeenAt: z.iso.datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentListSchema = z.object({ data: z.array(agentSchema) });

export const agentRegistrationDefaultsSchema = z.object({
  environmentId: z.uuid(),
  environmentName: z.string(),
  extractorReleaseId: z.uuid(),
  extractorVersion: z.string(),
  redactionPolicyVersionId: z.uuid(),
  redactionPolicyVersion: z.number().int().positive(),
  samplingPolicyVersionId: z.uuid(),
  samplingPolicyVersion: z.number().int().positive(),
});

export const issuedMachineCredentialSchema = z.object({
  id: z.uuid(),
  token: z.string().min(1),
  tokenPrefix: z.string().min(1),
  scopes: z.array(machineScopeSchema),
  expiresAt: z.iso.datetime(),
});

export const createAgentResponseSchema = z.object({
  agent: agentSchema,
  credential: issuedMachineCredentialSchema,
});

export const agentPathParamsSchema = z.strictObject({ agentId: z.uuid() });
export const serviceAgentPathParamsSchema = z.strictObject({
  identifier: z.string().min(1).max(100),
  agentId: z.uuid().optional(),
});

export const rotateAgentCredentialRequestSchema = z.strictObject({
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

export const agentHeartbeatRequestSchema = z.strictObject({
  agentVersion: z.string().trim().min(1).max(64),
  configRevision: z.number().int().positive(),
  status: z.enum(["online", "degraded"]),
  errorCode: z.string().trim().min(1).max(100).nullable().optional(),
});

export const agentConfigurationSchema = z.object({
  agentId: z.uuid(),
  configRevision: z.number().int().positive(),
  extractor: z.object({
    id: z.uuid(),
    semanticVersion: z.string(),
    schemaVersion: z.number().int(),
  }),
  redaction: z.object({ id: z.uuid(), version: z.number().int(), celSource: z.string() }),
  sampling: z.object({
    id: z.uuid(),
    version: z.number().int(),
    sessionWindowSeconds: z.number().int().positive(),
    baseSampleRate: z.number().min(0).max(1),
    lowVolumeThreshold: z.number().int().nonnegative(),
    lowVolumeBoost: z.number().min(1),
    correlationHeaderNames: z.array(z.string()),
  }),
  keys: z.object({
    structural: z.object({ versionId: z.uuid(), material: z.string().min(43) }),
    consumerIdentity: z.object({ versionId: z.uuid(), material: z.string().min(43) }),
    sampling: z.object({ policyVersionId: z.uuid(), material: z.string().min(43) }),
  }),
});

export const agentHeartbeatResponseSchema = z.object({
  accepted: z.literal(true),
  configRevision: z.number().int().positive(),
  configurationChanged: z.boolean(),
});

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = z.infer<typeof jsonPrimitiveSchema> | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);
const hmacSchema = z.string().regex(/^hmac-sha256:[0-9a-f]{64}$/);
const headerMapSchema = z.record(
  z.string().trim().min(1).max(100),
  z.array(z.string().max(2_000)).max(20),
);

const forbiddenHeaders = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);
export const processedExchangeSchema = z
  .strictObject({
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    operation_key: z.string().trim().min(1).max(500),
    request_method: z
      .string()
      .regex(/^[A-Z]+$/)
      .max(20),
    request_path: z.string().startsWith("/").max(2_048),
    request_headers: headerMapSchema.optional(),
    request_query: z.record(z.string(), jsonValueSchema).optional(),
    request_body: jsonValueSchema.optional(),
    response_status: z.number().int().min(100).max(599),
    response_headers: headerMapSchema.optional(),
    response_body: jsonValueSchema.optional(),
  })
  .superRefine((exchange, context) => {
    for (const headers of [exchange.request_headers, exchange.response_headers]) {
      for (const name of Object.keys(headers ?? {})) {
        if (forbiddenHeaders.has(name.toLowerCase())) {
          context.addIssue({
            code: "custom",
            message: `Forbidden header crossed capture boundary: ${name}`,
          });
        }
      }
    }
  });

const fingerprintSchema = z.strictObject({
  operation_key: z.string().min(1).max(500),
  kind: z.enum(["shape", "ordering", "error_template"]),
  schema_version: z.number().int().positive(),
  canonical: z.record(z.string(), jsonValueSchema),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  default_label: z.string().min(1).max(500),
  observation_count: z.number().int().positive(),
});

const echoEvidenceSchema = z.strictObject({
  source_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  destination_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  source_path: z.string().min(1).max(2_048),
  destination_path: z.string().min(1).max(2_048),
  value_token: hmacSchema,
  source_operation_key: z.string().min(1).max(500),
  source_shape_digest: z.string().regex(/^[0-9a-f]{64}$/),
});

export const processedCaptureSessionSchema = z
  .strictObject({
    schema_version: z.number().int().positive(),
    extractor_version: z.string().min(1).max(64),
    consumer_hmac: hmacSchema,
    session_hmac: hmacSchema,
    started_at: z.iso.datetime(),
    ended_at: z.iso.datetime(),
    first_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    last_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    completeness: z.enum(["complete", "partial", "truncated"]),
    correlation_source: z.enum(["configured_correlation_id", "time_window"]),
    sampling_probability: z.number().positive().max(1),
    low_volume_boosted: z.boolean(),
    exchanges: z.array(processedExchangeSchema).min(1).max(1_000),
    extraction: z.strictObject({
      schema_version: z.number().int().positive(),
      extractor_version: z.string().min(1).max(64),
      fingerprints: z.array(fingerprintSchema).max(5_000),
      echoes: z.array(echoEvidenceSchema).max(5_000).nullable(),
    }),
  })
  .superRefine((session, context) => {
    if (Date.parse(session.ended_at) < Date.parse(session.started_at)) {
      context.addIssue({ code: "custom", message: "ended_at precedes started_at" });
    }
    if (session.last_sequence < session.first_sequence) {
      context.addIssue({ code: "custom", message: "last_sequence precedes first_sequence" });
    }
    if (session.completeness !== "complete" && (session.extraction.echoes?.length ?? 0) > 0) {
      context.addIssue({ code: "custom", message: "Incomplete sessions cannot contain T1 echoes" });
    }
  });
export type ProcessedCaptureSession = z.infer<typeof processedCaptureSessionSchema>;

export const ingestionBatchRequestSchema = z.strictObject({
  agentBatchId: z.string().trim().min(1).max(200),
  schemaVersion: z.number().int().positive(),
  extractorReleaseId: z.uuid(),
  redactionPolicyVersionId: z.uuid(),
  samplingPolicyVersionId: z.uuid(),
  sessions: z.array(z.unknown()).min(1).max(500),
});

export const ingestionRejectionSchema = z.object({
  index: z.number().int().nonnegative(),
  code: z.string(),
  detail: z.string(),
});
export const ingestionBatchResponseSchema = z.object({
  batchId: z.uuid(),
  duplicate: z.boolean(),
  status: z.enum(["validated", "partially_rejected"]),
  sessionCount: z.number().int().nonnegative(),
  acceptedItemCount: z.number().int().nonnegative(),
  rejectedItemCount: z.number().int().nonnegative(),
  rejections: z.array(ingestionRejectionSchema).max(100),
});
