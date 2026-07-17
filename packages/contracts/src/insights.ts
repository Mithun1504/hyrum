import { z } from "zod";

const countMapSchema = z.record(z.string(), z.number().int().nonnegative());

export const serviceInsightsSchema = z.object({
  ledger: z.object({
    total: z.number().int().nonnegative(),
    byTier: z.object({
      t1: z.number().int().nonnegative(),
      t2: z.number().int().nonnegative(),
      t3: z.number().int().nonnegative(),
    }),
    byFreshness: countMapSchema,
  }),
  replays: z.object({
    total: z.number().int().nonnegative(),
    stableDeltaRate: z.number().min(0).max(1).nullable(),
    stableDeltaSampleCount: z.number().int().nonnegative(),
    gateOutcomes: countMapSchema,
  }),
  assertions: z.object({ total: z.number().int().nonnegative(), byStatus: countMapSchema }),
  quality: z.object({
    precision: z.number().min(0).max(1).nullable(),
    recall: z.number().min(0).max(1).nullable(),
    sampleCount: z.number().int().nonnegative(),
  }),
  usage: z.object({
    ingestedSessions: z.number().int().nonnegative(),
    observedRequestsEstimate: z.number().int().nonnegative(),
    replayRequests: z.number().int().nonnegative(),
    llmCostMicrounits: z.number().int().nonnegative(),
  }),
});
export type ServiceInsights = z.infer<typeof serviceInsightsSchema>;

export const consumerInsightSchema = z.object({
  id: z.uuid(),
  displayAlias: z.string(),
  requestCount: z.number().int().nonnegative(),
  lowVolume: z.boolean(),
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  claimCount: z.number().int().nonnegative(),
  t1Count: z.number().int().nonnegative(),
  t2Count: z.number().int().nonnegative(),
  t3Count: z.number().int().nonnegative(),
});
export const consumerInsightListSchema = z.object({ data: z.array(consumerInsightSchema) });

export const endpointInsightSchema = z.object({
  id: z.uuid(),
  method: z.string(),
  normalizedPath: z.string(),
  operationId: z.string().nullable(),
  claimCount: z.number().int().nonnegative(),
  consumerCount: z.number().int().nonnegative(),
  t1Count: z.number().int().nonnegative(),
  t2Count: z.number().int().nonnegative(),
  t3Count: z.number().int().nonnegative(),
});
export const endpointInsightListSchema = z.object({ data: z.array(endpointInsightSchema) });
