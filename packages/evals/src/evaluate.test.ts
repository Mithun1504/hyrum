import { describe, expect, it } from "vitest";
import { classifyExample, evaluateDataset, releaseDatasetSchema } from "./evaluate";

const base = {
  id: "example",
  expectedTier: "t3" as const,
  evidence: { completeSession: true, echoPairs: 0, retryCovariation: null },
};

describe("release evaluation", () => {
  it("reserves T1 for complete echo evidence", () => {
    expect(classifyExample({ ...base, evidence: { ...base.evidence, echoPairs: 1 } })).toBe("t1");
    expect(
      classifyExample({
        ...base,
        evidence: { ...base.evidence, completeSession: false, echoPairs: 1 },
      }),
    ).toBe("t3");
  });

  it("requires controlled, significant retry covariation for T2", () => {
    expect(
      classifyExample({
        ...base,
        evidence: {
          ...base.evidence,
          retryCovariation: {
            exposedTotal: 20,
            exposedRetries: 18,
            controlTotal: 20,
            controlRetries: 2,
            statusControlled: true,
          },
        },
      }),
    ).toBe("t2");
  });

  it("reports T1 precision and recall together", () => {
    const dataset = releaseDatasetSchema.parse({
      schemaVersion: 1,
      name: "test",
      version: 1,
      extractorVersion: "1.0.0",
      ruleVersion: "test-v1",
      thresholds: { t1Precision: 0.95 },
      examples: [
        {
          ...base,
          id: "positive",
          expectedTier: "t1",
          evidence: { ...base.evidence, echoPairs: 1 },
        },
        base,
      ],
    });
    const result = evaluateDataset(dataset);
    expect(result.metrics[0]).toMatchObject({ precision: 1, recall: 1 });
    expect(result.passed).toBe(true);
  });
});
