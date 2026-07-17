import { z } from "zod";

export const replayCorpusSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.enum(["building", "ready", "superseded", "expired", "failed"]),
  corpusDigest: z.string().regex(/^[0-9a-f]{64}$/),
  itemCount: z.number().int().nonnegative(),
  operationCount: z.number().int().nonnegative(),
  consumerCount: z.number().int().nonnegative(),
  assertionCount: z.number().int().nonnegative(),
  fixtureRequiredCount: z.number().int().nonnegative(),
  includedAssertionIds: z.array(z.uuid()),
  sourceWindowStart: z.iso.datetime(),
  sourceWindowEnd: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type ReplayCorpus = z.infer<typeof replayCorpusSchema>;
export const replayCorpusListSchema = z.object({ data: z.array(replayCorpusSchema) });

export const activeReplayProfileSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  name: z.string(),
  allowedOperationMode: z.enum(["read_only", "explicit_writes"]),
  networkEgressEnabled: z.boolean(),
  requestTimeoutMs: z.number().int().positive(),
  resourceLimits: z.record(z.string(), z.unknown()),
  fixtureConfigured: z.boolean(),
  stubConfigured: z.boolean(),
  configDigest: z.string(),
});
export type ActiveReplayProfile = z.infer<typeof activeReplayProfileSchema>;
export const replayCorpusWorkspaceSchema = z.object({
  profile: activeReplayProfileSchema,
  corpora: z.array(replayCorpusSchema),
});
export const corpusBuildResponseSchema = z.object({
  accepted: z.literal(true),
  jobId: z.uuid(),
});
export const corpusPathParamsSchema = z.strictObject({ corpusId: z.uuid() });
