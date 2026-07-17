import { z } from "zod";

const digestSchema = z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/);

const createReplayRequestShape = {
  replayCorpusId: z.uuid(),
  baseImageDigest: digestSchema,
  candidateImageDigest: digestSchema,
  triggerIdempotencyKey: z.string().trim().min(1).max(200),
  runnerVersion: z.string().trim().min(1).max(100),
  reportSigningPublicKey: z.string().trim().min(40).max(2_000),
  signingKeyId: z.string().trim().min(1).max(200),
  repositoryConnectionId: z.uuid().optional(),
  pullRequestNumber: z.number().int().positive().optional(),
} as const;

export const createReplayRequestSchema = z
  .strictObject(createReplayRequestShape)
  .superRefine((input, context) => {
    if ((input.repositoryConnectionId === undefined) !== (input.pullRequestNumber === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["repositoryConnectionId"],
        message: "Repository connection and pull request number must be supplied together",
      });
    }
  });
export type CreateReplayRequest = z.infer<typeof createReplayRequestSchema>;
export const createReplayRunRequestSchema = createReplayRequestSchema;
export type CreateReplayRunRequest = CreateReplayRequest;

export const githubActionReplayRequestSchema = z.strictObject({
  replayCorpusId: createReplayRequestShape.replayCorpusId,
  baseImageDigest: createReplayRequestShape.baseImageDigest,
  candidateImageDigest: createReplayRequestShape.candidateImageDigest,
  triggerIdempotencyKey: createReplayRequestShape.triggerIdempotencyKey,
  runnerVersion: createReplayRequestShape.runnerVersion,
  reportSigningPublicKey: createReplayRequestShape.reportSigningPublicKey,
  signingKeyId: createReplayRequestShape.signingKeyId,
  serviceSlug: z.string().trim().min(2).max(80),
  pullRequestNumber: z.number().int().positive(),
});
export type GitHubActionReplayRequest = z.infer<typeof githubActionReplayRequestSchema>;

export const gateImpactSchema = z.object({
  id: z.uuid(),
  replayDeltaId: z.uuid(),
  consumerId: z.uuid(),
  consumerAlias: z.string(),
  dependencyClaimId: z.uuid().nullable(),
  assertionId: z.uuid().nullable(),
  effectiveTier: z.enum(["t1", "t2", "t3"]).nullable(),
  kind: z.enum(["shape", "ordering", "error_template"]),
  stability: z.enum(["pending", "stable", "flaky", "quarantined"]),
  action: z.enum(["block", "warn", "note", "pass"]),
  reasonCode: z.string(),
  receiptId: z.uuid().nullable(),
  gateExceptionId: z.uuid().nullable(),
});
export const gateDecisionSchema = z.object({
  id: z.uuid(),
  outcome: z.enum(["block", "warn", "note", "pass"]),
  decisionEngineVersion: z.string(),
  blockingImpactCount: z.number().int().nonnegative(),
  warningImpactCount: z.number().int().nonnegative(),
  notedImpactCount: z.number().int().nonnegative(),
  evaluatedAt: z.iso.datetime(),
  impacts: z.array(gateImpactSchema),
});

export const replayRunSchema = z.object({
  id: z.uuid(),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  replayCorpusId: z.uuid(),
  replayProfileId: z.uuid(),
  baseImageDigest: digestSchema,
  candidateImageDigest: digestSchema,
  fixtureDigest: z.string().min(1).max(200),
  maskDigest: digestSchema,
  runnerVersion: z.string(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  gateDecision: gateDecisionSchema.nullable(),
});
export type ReplayRun = z.infer<typeof replayRunSchema>;
export const replayRunListSchema = z.object({ data: z.array(replayRunSchema) });
export const createReplayRunResponseSchema = z.object({
  run: replayRunSchema,
  runnerCredential: z.object({
    token: z.string().startsWith("hyrum_runner_"),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.iso.datetime(),
    corpusUrl: z.url(),
    corpusDigest: digestSchema,
    corpusUrlExpiresAt: z.iso.datetime(),
    nonceDigest: digestSchema,
    reportUploadPath: z.string().startsWith("/v1/runner/replays/"),
    fixtureDigest: z.string().min(1).max(200),
    maskDigest: digestSchema,
    extractorVersion: z.string().min(1).max(64),
  }),
});

export const createReplayResponseSchema = z.object({
  replayRunId: z.uuid(),
  runnerToken: z.string().startsWith("hyrum_runner_"),
  expiresAt: z.iso.datetime(),
  corpusDigest: digestSchema,
  profile: z.object({
    allowedOperationMode: z.enum(["read_only", "explicit_writes"]),
    requestTimeoutMs: z.number().int().positive(),
    networkEgressEnabled: z.boolean(),
    fixtureConfigured: z.boolean(),
  }),
});

export const runnerCorpusAccessSchema = z.object({
  replayRunId: z.uuid(),
  corpusDigest: digestSchema,
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());
export const replayReportDeltaSchema = z.strictObject({
  api_operation_id: z.uuid(),
  behavior_definition_id: z.uuid(),
  consumer_id: z.uuid(),
  assertion_id: z.uuid().nullable(),
  request_digest: digestSchema,
  kind: z.enum(["shape", "ordering", "error_template"]),
  delta_digest: digestSchema,
  before_digest: digestSchema.nullable(),
  after_digest: digestSchema.nullable(),
  normalized_before: jsonObjectSchema.optional(),
  normalized_after: jsonObjectSchema.optional(),
  stability: z.enum(["stable", "flaky"]),
  agreeing_attempts: z.number().int().nonnegative(),
  total_attempts: z.number().int().min(2).max(10),
});
export const replayReportSchema = z
  .strictObject({
    schema_version: z.literal(1),
    replay_run_id: z.uuid(),
    corpus_digest: digestSchema,
    base_image_digest: digestSchema,
    candidate_image_digest: digestSchema,
    fixture_digest: z.string().min(1).max(200),
    mask_digest: digestSchema,
    runner_version: z.string().trim().min(1).max(100),
    nonce_digest: digestSchema,
    extractor_version: z.string().trim().min(1).max(64),
    attempts: z.number().int().min(2).max(10),
    started_at: z.iso.datetime(),
    completed_at: z.iso.datetime(),
    deltas: z.array(replayReportDeltaSchema).max(10_000),
  })
  .superRefine((report, context) => {
    if (Date.parse(report.completed_at) < Date.parse(report.started_at)) {
      context.addIssue({
        code: "custom",
        path: ["completed_at"],
        message: "Report completed before it started",
      });
    }
    if (report.deltas.some(({ total_attempts }) => total_attempts !== report.attempts)) {
      context.addIssue({
        code: "custom",
        path: ["deltas"],
        message: "Delta attempt counts must match the report",
      });
    }
    if (
      new Set(report.deltas.map(({ delta_digest }) => delta_digest)).size !== report.deltas.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["deltas"],
        message: "Delta digests must be unique",
      });
    }
  });
export type ReplayReport = z.infer<typeof replayReportSchema>;

export const uploadReplayReportRequestSchema = z.strictObject({
  reportBase64: z
    .string()
    .min(1)
    .max(16 * 1024 * 1024),
  signatureBase64: z.string().min(80).max(200),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const runnerScopeSchema = z.enum(["corpus:read", "report:write"]);
export type RunnerScope = z.infer<typeof runnerScopeSchema>;

export const replayReportAcceptedSchema = z.object({
  replayRunId: z.uuid(),
  status: z.literal("succeeded"),
  deltaCount: z.number().int().nonnegative(),
  gateDecision: z.object({
    id: z.uuid(),
    outcome: z.enum(["block", "warn", "note", "pass", "error", "cancelled"]),
    blockingImpactCount: z.number().int().nonnegative(),
    warningImpactCount: z.number().int().nonnegative(),
    notedImpactCount: z.number().int().nonnegative(),
    decisionDigest: digestSchema,
  }),
});
export const replayRunPathParamsSchema = z.strictObject({ replayRunId: z.uuid() });

export const replayDeltaDetailSchema = z.object({
  id: z.uuid(),
  operation: z.object({ method: z.string(), path: z.string() }),
  kind: z.enum(["shape", "ordering", "error_template"]),
  stability: z.enum(["pending", "stable", "flaky", "quarantined"]),
  agreeingAttempts: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  normalizedBefore: jsonObjectSchema.nullable(),
  normalizedAfter: jsonObjectSchema.nullable(),
  quarantineReason: z.string().nullable(),
});

export const gateImpactDetailSchema = z.object({
  id: z.uuid(),
  replayDeltaId: z.uuid(),
  consumer: z.object({ id: z.uuid(), alias: z.string() }),
  dependencyClaimId: z.uuid().nullable(),
  assertionId: z.uuid().nullable(),
  effectiveTier: z.enum(["t1", "t2", "t3"]).nullable(),
  action: z.enum(["block", "warn", "note", "pass", "error", "cancelled"]),
  reasonCode: z.string(),
  receiptId: z.uuid().nullable(),
  exceptionApplied: z.boolean(),
});

export const replayRunDetailSchema = z.object({
  run: replayRunSchema,
  gateDecision: z
    .object({
      id: z.uuid(),
      outcome: z.enum(["block", "warn", "note", "pass", "error", "cancelled"]),
      blockingImpactCount: z.number().int().nonnegative(),
      warningImpactCount: z.number().int().nonnegative(),
      notedImpactCount: z.number().int().nonnegative(),
      decisionDigest: digestSchema,
      engineVersion: z.string(),
      evaluatedAt: z.iso.datetime(),
    })
    .nullable(),
  deltas: z.array(replayDeltaDetailSchema),
  impacts: z.array(gateImpactDetailSchema),
});
export type ReplayRunDetail = z.infer<typeof replayRunDetailSchema>;
