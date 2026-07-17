import { describe, expect, it } from "vitest";
import {
  validateBehaviorLabelProposal,
  validateCustomerNoticeDraft,
  validateSpecPatchDraft,
  validateTierProposal,
} from "./prompts";

const behaviorId = "00000000-0000-4000-8000-000000000001";
const resources = {
  behaviorDefinitionIds: [behaviorId],
  dependencyClaimIds: [],
  receiptIds: [],
};
const citation = {
  resourceType: "behavior_definition" as const,
  resourceId: behaviorId,
  role: "supports" as const,
};

describe("product draft deterministic validators", () => {
  it("accepts a cited additive JSON patch", () => {
    const output = {
      title: "Document response field",
      rationale: "Observed behavior is intentionally documented.",
      patch: JSON.stringify([{ op: "add", path: "/responses/200/content", value: {} }]),
      format: "json_patch" as const,
      uncertainty: 0.1,
      abstained: false,
      abstentionReason: null,
      citations: [citation],
    };
    expect(validateSpecPatchDraft(resources, output)).toBe(output);
  });

  it("rejects destructive or uncited patches", () => {
    expect(() =>
      validateSpecPatchDraft(resources, {
        title: "Remove contract",
        rationale: "Unsafe",
        patch: JSON.stringify([{ op: "remove", path: "/responses/200" }]),
        format: "json_patch",
        uncertainty: 0.1,
        abstained: false,
        abstentionReason: null,
        citations: [citation],
      }),
    ).toThrow(/only contain absolute add/);
  });

  it("rejects links invented in customer notices", () => {
    expect(() =>
      validateCustomerNoticeDraft(resources, {
        subject: "Compatibility change",
        body: "Migrate at https://untrusted.example",
        audienceSummary: "Affected consumers",
        uncertainty: 0.2,
        abstained: false,
        abstentionReason: null,
        citations: [citation],
      }),
    ).toThrow(/untrusted link/);
  });

  it("requires behavior labels to cite only their deterministic identity", () => {
    expect(
      validateBehaviorLabelProposal(behaviorId, {
        label: "Undocumented cursor field",
        description: "A response cursor observed outside the declared contract.",
        clusterLabel: "Pagination behaviors",
        uncertainty: 0.1,
        abstained: false,
        abstentionReason: null,
        citations: [citation],
      }).label,
    ).toBe("Undocumented cursor field");
    expect(() =>
      validateBehaviorLabelProposal(behaviorId, {
        label: "Invented label",
        description: "Unsupported",
        clusterLabel: null,
        uncertainty: 0.2,
        abstained: false,
        abstentionReason: null,
        citations: [{ ...citation, resourceId: "00000000-0000-4000-8000-000000000099" }],
      }),
    ).toThrow(/outside its minimized input/);
  });

  it("keeps tier proposals inside cited T2/T3 evidence", () => {
    const claimId = "00000000-0000-4000-8000-000000000002";
    const output = {
      proposedTier: "t2" as const,
      rationale: "Retry behavior varies with the observed error template.",
      uncertainty: 0.25,
      abstained: false,
      abstentionReason: null,
      citations: [
        {
          resourceType: "dependency_claim" as const,
          resourceId: claimId,
          role: "supports" as const,
        },
      ],
    };
    expect(
      validateTierProposal({ ...resources, dependencyClaimIds: [claimId] }, output).proposedTier,
    ).toBe("t2");
  });
});
