import { describe, expect, it } from "vitest";
import { normalizeSpecification, SpecificationValidationError } from "./index";

const minimal = `
openapi: 3.1.0
info:
  title: Payments
  version: 1.0.0
paths:
  /customers/{customerId}:
    get:
      operationId: getCustomer
      responses:
        "200":
          description: OK
`;

describe("OpenAPI normalization", () => {
  it("produces stable operation identities independent of parameter names", async () => {
    const first = await normalizeSpecification(minimal);
    const second = await normalizeSpecification(minimal.replaceAll("customerId", "id"));
    expect(first.operations).toHaveLength(1);
    expect(first.operations[0]?.normalizedPathTemplate).toBe("/customers/{}");
    expect(first.operations[0]?.operationKey).toBe(second.operations[0]?.operationKey);
  });

  it("rejects external references before parser egress", async () => {
    const source = `${minimal}\ncomponents:\n  schemas:\n    Customer:\n      $ref: https://attacker.invalid/schema.yaml`;
    await expect(normalizeSpecification(source)).rejects.toBeInstanceOf(
      SpecificationValidationError,
    );
  });

  it("rejects Swagger 2 documents", async () => {
    await expect(
      normalizeSpecification('{"swagger":"2.0","info":{"title":"x","version":"1"},"paths":{}}'),
    ).rejects.toMatchObject({ message: "Only OpenAPI 3.x documents are supported" });
  });
});
