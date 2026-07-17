import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabaseClient, persistGlobalEvaluation } from "@hyrum/db";
import { evaluateDataset, releaseDatasetSchema } from "./evaluate";

const defaultDatasetPath = fileURLToPath(new URL("../datasets/release-v1.json", import.meta.url));
const datasetPath = process.argv[2] ? resolve(process.argv[2]) : defaultDatasetPath;
const raw = await readFile(datasetPath, "utf8");
const dataset = releaseDatasetSchema.parse(JSON.parse(raw));
const result = evaluateDataset(dataset);

if (process.env.DATABASE_URL) {
  const client = createDatabaseClient(process.env.DATABASE_URL, 1);
  try {
    await persistGlobalEvaluation(client.db, {
      dataset: {
        name: dataset.name,
        version: dataset.version,
        repositoryPath: "packages/evals/datasets/release-v1.json",
        digest: result.digest,
        labelSchemaVersion: dataset.schemaVersion,
        exampleCount: dataset.examples.length,
      },
      extractorVersion: dataset.extractorVersion,
      evaluationType: "deterministic_claim_inference",
      ruleVersion: dataset.ruleVersion,
      configDigest: result.digest,
      metrics: result.metrics.flatMap((metric) => [
        {
          metricName: "precision" as const,
          evidenceTier: metric.tier,
          value: metric.precision,
          sampleCount: metric.sampleCount,
          threshold: metric.tier === "t1" ? dataset.thresholds.t1Precision : null,
          passed: metric.tier === "t1" ? metric.precision >= dataset.thresholds.t1Precision : null,
        },
        {
          metricName: "recall" as const,
          evidenceTier: metric.tier,
          value: metric.recall,
          sampleCount: metric.sampleCount,
          threshold: null,
          passed: null,
        },
        {
          metricName: "f1" as const,
          evidenceTier: metric.tier,
          value: metric.f1,
          sampleCount: metric.sampleCount,
          threshold: null,
          passed: null,
        },
        ...(
          [
            ["true_positive", metric.truePositive],
            ["false_positive", metric.falsePositive],
            ["false_negative", metric.falseNegative],
          ] as const
        ).map(([metricName, value]) => ({
          metricName,
          evidenceTier: metric.tier,
          value,
          sampleCount: metric.sampleCount,
          threshold: null,
          passed: null,
        })),
      ]),
    });
  } finally {
    await client.close();
  }
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
