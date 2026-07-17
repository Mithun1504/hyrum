import { and, eq } from "drizzle-orm";
import type { Database } from "./index";
import { evaluationDatasets, evaluationMetrics, evaluationRuns, extractorReleases } from "./schema";

export interface EvaluationMetricInput {
  metricName: "precision" | "recall" | "f1" | "true_positive" | "false_positive" | "false_negative";
  evidenceTier: "t1" | "t2" | "t3";
  value: number;
  sampleCount: number;
  threshold: number | null;
  passed: boolean | null;
}

/**
 * Persists an immutable repository-backed release evaluation. This function is
 * intentionally global and must only be called with the release/evaluation
 * database role, never from a tenant request handler.
 */
export async function persistGlobalEvaluation(
  db: Database,
  input: {
    dataset: {
      name: string;
      version: number;
      repositoryPath: string;
      digest: string;
      labelSchemaVersion: number;
      exampleCount: number;
    };
    extractorVersion: string;
    evaluationType: string;
    ruleVersion: string;
    configDigest: string;
    metrics: readonly EvaluationMetricInput[];
  },
): Promise<{ datasetId: string; runId: string }> {
  const t1Names = new Set(
    input.metrics
      .filter((metric) => metric.evidenceTier === "t1")
      .map((metric) => metric.metricName),
  );
  if (!t1Names.has("precision") || !t1Names.has("recall")) {
    throw new Error("T1 evaluations must persist precision and recall together");
  }

  return db.transaction(async (tx) => {
    const [extractor] = await tx
      .select({ id: extractorReleases.id })
      .from(extractorReleases)
      .where(eq(extractorReleases.semanticVersion, input.extractorVersion))
      .limit(1);
    if (!extractor) {
      throw new Error(`Extractor release ${input.extractorVersion} is not registered`);
    }

    await tx
      .insert(evaluationDatasets)
      .values({
        scope: "global",
        organizationId: null,
        name: input.dataset.name,
        version: input.dataset.version,
        repositoryPath: input.dataset.repositoryPath,
        datasetDigest: input.dataset.digest,
        labelSchemaVersion: input.dataset.labelSchemaVersion,
        exampleCount: input.dataset.exampleCount,
        status: "active",
      })
      .onConflictDoNothing();
    const [dataset] = await tx
      .select({ id: evaluationDatasets.id, digest: evaluationDatasets.datasetDigest })
      .from(evaluationDatasets)
      .where(
        and(
          eq(evaluationDatasets.scope, "global"),
          eq(evaluationDatasets.name, input.dataset.name),
          eq(evaluationDatasets.version, input.dataset.version),
        ),
      )
      .limit(1);
    if (!dataset) throw new Error("Evaluation dataset could not be registered");
    if (dataset.digest !== input.dataset.digest) {
      throw new Error("The committed evaluation dataset changed without a version increment");
    }

    const startedAt = new Date();
    const [run] = await tx
      .insert(evaluationRuns)
      .values({
        scope: "global",
        organizationId: null,
        apiServiceId: null,
        evaluationDatasetId: dataset.id,
        evaluationType: input.evaluationType,
        extractorReleaseId: extractor.id,
        ruleVersion: input.ruleVersion,
        configDigest: input.configDigest,
        status: "succeeded",
        startedAt,
        completedAt: new Date(),
      })
      .returning({ id: evaluationRuns.id });
    if (!run) throw new Error("Evaluation run could not be persisted");
    await tx.insert(evaluationMetrics).values(
      input.metrics.map((metric) => ({
        scope: "global" as const,
        organizationId: null,
        evaluationRunId: run.id,
        metricName: metric.metricName,
        evidenceTier: metric.evidenceTier,
        value: metric.value.toString(),
        sampleCount: metric.sampleCount,
        threshold: metric.threshold?.toString() ?? null,
        passed: metric.passed,
      })),
    );
    return { datasetId: dataset.id, runId: run.id };
  });
}
