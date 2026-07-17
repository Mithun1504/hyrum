import { z } from "zod";

const countByKeySchema = z.record(z.string(), z.number().int().nonnegative());
export const serviceHealthReportSchema = z.object({
  service: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  generatedAt: z.iso.datetime(),
  ledger: z.object({
    total: z.number().int().nonnegative(),
    byTier: countByKeySchema,
    byFreshness: countByKeySchema,
  }),
  assertions: z.object({ total: z.number().int().nonnegative(), byStatus: countByKeySchema }),
  gates: z.object({ total: z.number().int().nonnegative(), byOutcome: countByKeySchema }),
  consumers: z.number().int().nonnegative(),
  operations: z.number().int().nonnegative(),
  timeToFirstUsefulLedgerSeconds: z.number().int().nonnegative().nullable(),
  usage: z.object({
    windowDays: z.literal(30),
    ingestedSessions: z.string().regex(/^\d+$/),
    observedRequestsEstimate: z.string().regex(/^\d+$/),
    replayRequests: z.string().regex(/^\d+$/),
    llmInputTokens: z.string().regex(/^\d+$/),
    llmOutputTokens: z.string().regex(/^\d+$/),
    llmCostMicrounits: z.string().regex(/^\d+$/),
    jobFailures: z.number().int().nonnegative(),
  }),
});
export type ServiceHealthReport = z.infer<typeof serviceHealthReportSchema>;
