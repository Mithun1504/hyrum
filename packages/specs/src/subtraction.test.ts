import { describe, expect, it } from "vitest";
import { classifyBehaviorFingerprint, classifyShapeFingerprint } from "./subtraction";

const contract = {
  components: {},
  operation: {
    responses: {
      "200": {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { id: { type: "string" } },
            },
          },
        },
      },
      "422": { description: "Invalid request" },
    },
  },
};

describe("OpenAPI subtraction", () => {
  it("separates declared and undeclared response nodes", () => {
    expect(
      classifyShapeFingerprint(
        {
          status: 200,
          nodes: [
            { path: "$", type: "object" },
            { path: "$/id", type: "string" },
            { path: "$/legacy_id", type: "string" },
          ],
        },
        contract,
      ),
    ).toMatchObject({
      status: "partially_declared",
      details: { undeclaredNodes: [{ path: "$/legacy_id", type: "string" }] },
    });
  });

  it("treats a declared error status without an exact template as partial declaration", () => {
    expect(
      classifyBehaviorFingerprint(
        "error_template",
        { status: 422, template: { error: "invalid {uuid}" } },
        contract,
      ),
    ).toMatchObject({
      status: "partially_declared",
      reasonCode: "error_status_declared_template_undeclared",
    });
  });

  it("requires an explicit ordering extension", () => {
    expect(
      classifyBehaviorFingerprint(
        "ordering",
        { candidates: [{ array_path: "$/items", key: "id", direction: "ascending" }] },
        contract,
      ),
    ).toMatchObject({ status: "undeclared", reasonCode: "response_ordering_not_declared" });
  });
});
