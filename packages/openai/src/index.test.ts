import { describe, expect, it } from "vitest";
import {
  clusterAndNameBehaviors,
  deterministicSpecDraftFallback,
  draftOpenApiChange,
  proposeEvidenceTiers,
  type SpecDraftInput,
} from "./index";

const input: SpecDraftInput = {
  method: "GET",
  path: "/products",
  behaviorKind: "shape",
  behaviorPath: "response.next_cursor",
  description: "Clients echo the cursor in a later request.",
  receiptIds: ["receipt-1"],
  redactedEvidence: ["response.next_cursor hash equals later request.query.cursor hash"],
};

describe("OpenAI advisory boundary", () => {
  it("accepts a structured draft that cites only supplied receipts", async () => {
    const client = {
      responses: {
        parse: async () => ({
          id: "resp-1",
          model: "gpt-5.6",
          output_parsed: {
            title: "Document pagination cursor",
            summary: "Adds the observed pagination cursor to the response schema.",
            rationale: "The cursor is echoed by clients.",
            receiptIds: ["receipt-1"],
            uncertainty: 0.1,
            abstained: false,
            abstentionReason: null,
            openapiPatch: [
              {
                op: "add",
                path: "/paths/~1products/get/responses/200/content/application~1json/schema/properties/next_cursor",
                value: { type: "string", description: null, format: null },
              },
            ],
          },
        }),
      },
    };

    const draft = await draftOpenApiChange(input, {
      client: client as never,
    });
    expect(draft.result.receiptIds).toEqual(["receipt-1"]);
    expect(draft.promptVersion).toBe("spec-draft-v1");
  });

  it("rejects invented receipt citations", async () => {
    const client = {
      responses: {
        parse: async () => ({
          id: "resp-2",
          model: "gpt-5.6",
          output_parsed: {
            title: "Unsafe draft",
            summary: "Invented evidence.",
            rationale: "Not supported.",
            receiptIds: ["receipt-invented"],
            uncertainty: 0.1,
            abstained: false,
            abstentionReason: null,
            openapiPatch: [],
          },
        }),
      },
    };
    await expect(draftOpenApiChange(input, { client: client as never })).rejects.toThrow(
      "was not supplied",
    );
  });

  it("falls back without pretending a model draft exists", () => {
    const fallback = deterministicSpecDraftFallback(input);
    expect(fallback.abstained).toBe(true);
    expect(fallback.openapiPatch).toEqual([]);
  });

  it("runs the behavior clustering role with receipt-bound structured output", async () => {
    const client = parsedClient({
      summary: "One cluster",
      receiptIds: ["receipt-1"],
      uncertainty: 0.1,
      abstained: false,
      abstentionReason: null,
      clusters: [
        { name: "Pagination contract", description: "Cursor behavior", behaviorIds: ["b1"] },
      ],
    });
    const run = await clusterAndNameBehaviors(
      { receiptIds: ["receipt-1"], redactedEvidence: ["cursor hash"], behaviors: [{ id: "b1" }] },
      { client: client as never },
    );
    expect(run.result.clusters[0]?.name).toBe("Pagination contract");
  });

  it("rejects a model-proposed T1 tier without deterministic echo eligibility", async () => {
    const client = parsedClient({
      summary: "Proposal",
      receiptIds: ["receipt-1"],
      uncertainty: 0.2,
      abstained: false,
      abstentionReason: null,
      proposals: [
        { claimId: "claim-1", tier: "T1", rationale: "Looks important", receiptIds: ["receipt-1"] },
      ],
    });
    await expect(
      proposeEvidenceTiers(
        {
          receiptIds: ["receipt-1"],
          redactedEvidence: ["pattern only"],
          claims: [{ claimId: "claim-1", echoEligible: false }],
        },
        { client: client as never },
      ),
    ).rejects.toThrow("deterministic echo eligibility");
  });
});

function parsedClient(output: unknown) {
  return {
    responses: {
      parse: async () => ({ id: "resp-role", model: "gpt-5.6", output_parsed: output }),
    },
  };
}
