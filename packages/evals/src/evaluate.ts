import { createHash } from "node:crypto";
import { z } from "zod";

export const releaseDatasetSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  extractorVersion: z.string().min(1),
  ruleVersion: z.string().min(1),
  thresholds: z.object({ t1Precision: z.number().min(0).max(1) }),
  examples: z
    .array(
      z.object({
        id: z.string().min(1),
        expectedTier: z.enum(["t1", "t2", "t3"]),
        evidence: z.object({
          completeSession: z.boolean(),
          echoPairs: z.number().int().nonnegative(),
          retryCovariation: z
            .object({
              exposedTotal: z.number().int().nonnegative(),
              exposedRetries: z.number().int().nonnegative(),
              controlTotal: z.number().int().nonnegative(),
              controlRetries: z.number().int().nonnegative(),
              statusControlled: z.boolean(),
            })
            .nullable(),
        }),
      }),
    )
    .min(1),
});

export type ReleaseDataset = z.infer<typeof releaseDatasetSchema>;
export type EvidenceTier = "t1" | "t2" | "t3";

export function classifyExample(example: ReleaseDataset["examples"][number]): EvidenceTier {
  if (example.evidence.completeSession && example.evidence.echoPairs > 0) return "t1";
  const pattern = example.evidence.retryCovariation;
  if (!pattern?.statusControlled || pattern.exposedTotal < 5 || pattern.controlTotal < 5) {
    return "t3";
  }
  if (
    pattern.exposedRetries > pattern.exposedTotal ||
    pattern.controlRetries > pattern.controlTotal
  ) {
    return "t3";
  }
  const exposedRate = pattern.exposedRetries / pattern.exposedTotal;
  const controlRate = pattern.controlRetries / pattern.controlTotal;
  const difference = Math.abs(exposedRate - controlRate);
  const pooledRate =
    (pattern.exposedRetries + pattern.controlRetries) /
    (pattern.exposedTotal + pattern.controlTotal);
  const standardError = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / pattern.exposedTotal + 1 / pattern.controlTotal),
  );
  const zScore = standardError === 0 ? 0 : difference / standardError;
  return difference >= 0.3 && zScore >= 1.96 ? "t2" : "t3";
}

export interface TierMetrics {
  tier: EvidenceTier;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
  sampleCount: number;
}

export function evaluateDataset(dataset: ReleaseDataset): {
  digest: string;
  metrics: TierMetrics[];
  predictions: Array<{ id: string; expectedTier: EvidenceTier; predictedTier: EvidenceTier }>;
  passed: boolean;
} {
  const predictions = dataset.examples.map((example) => ({
    id: example.id,
    expectedTier: example.expectedTier,
    predictedTier: classifyExample(example),
  }));
  const metrics = (["t1", "t2", "t3"] as const).map((tier) => {
    const truePositive = predictions.filter(
      (item) => item.expectedTier === tier && item.predictedTier === tier,
    ).length;
    const falsePositive = predictions.filter(
      (item) => item.expectedTier !== tier && item.predictedTier === tier,
    ).length;
    const falseNegative = predictions.filter(
      (item) => item.expectedTier === tier && item.predictedTier !== tier,
    ).length;
    const precision =
      truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive);
    const recall =
      truePositive + falseNegative === 0 ? 0 : truePositive / (truePositive + falseNegative);
    return {
      tier,
      truePositive,
      falsePositive,
      falseNegative,
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      sampleCount: predictions.length,
    };
  });
  const t1 = metrics[0];
  return {
    digest: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
    metrics,
    predictions,
    passed: Boolean(t1 && t1.precision >= dataset.thresholds.t1Precision),
  };
}
