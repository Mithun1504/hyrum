import { describe, expect, it } from "vitest";
import { evaluateT2RetryCovariation, type T2PatternSample } from "./evidence-inference";

function samples(behaviorDefinitionId: string, count: number, retries: number): T2PatternSample[] {
  return Array.from({ length: count }, (_, index) => ({
    behaviorDefinitionId,
    retried: index < retries,
  }));
}

describe("T2 same-status retry covariation", () => {
  it("proposes a pattern only with supported, material, statistically separated variation", () => {
    const result = evaluateT2RetryCovariation([
      [...samples("template-a", 20, 18), ...samples("template-b", 20, 2)],
    ]);
    expect(result.get("template-a")).toMatchObject({
      supportCount: 20,
      metrics: { statusControlled: true, absoluteRateDifference: 0.8 },
    });
    expect(result.get("template-b")).toBeDefined();
  });

  it("rejects low-support and status-only hard negatives", () => {
    expect(
      evaluateT2RetryCovariation([
        [...samples("template-a", 4, 4), ...samples("template-b", 16, 0)],
      ]),
    ).toHaveLength(0);
    expect(
      evaluateT2RetryCovariation([
        [...samples("template-a", 20, 10), ...samples("template-b", 20, 9)],
      ]),
    ).toHaveLength(0);
  });
});
