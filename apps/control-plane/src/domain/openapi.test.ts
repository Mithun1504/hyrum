import { describe, expect, it } from "vitest";
import { isBehaviorDeclared, normalizeOpenApiSpec } from "./openapi";

const document = {
  openapi: "3.1.0",
  paths: {
    "/products": {
      get: {
        operationId: "listProducts",
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id", "name"],
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    deleted_at: { type: ["string", "null"] },
                    description: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe("OpenAPI subtraction", () => {
  it("keeps absent optional fields distinct from nullable fields", () => {
    const normalized = normalizeOpenApiSpec(document);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "shape",
        path: "$.deleted_at",
        fingerprint: { path: "$.deleted_at", type: "null" },
      }),
    ).toBe(true);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "shape",
        path: "$.name",
        fingerprint: { path: "$.name", type: "absent" },
      }),
    ).toBe(false);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "shape",
        path: "$.description",
        fingerprint: { path: "$.description", type: "absent" },
      }),
    ).toBe(true);
  });

  it("excludes declared fields but leaves next_cursor and legacy_id undeclared", () => {
    const normalized = normalizeOpenApiSpec(document);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "shape",
        path: "$.id",
        fingerprint: { path: "$.id", type: "string" },
      }),
    ).toBe(true);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "shape",
        path: "$.next_cursor",
        fingerprint: { path: "$.next_cursor", type: "string" },
      }),
    ).toBe(false);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "shape",
        path: "$.legacy_id",
        fingerprint: { path: "$.legacy_id", type: "string" },
      }),
    ).toBe(false);
  });

  it("checks status only for status candidates", () => {
    const normalized = normalizeOpenApiSpec(document);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "status",
        path: "200",
        fingerprint: 200,
      }),
    ).toBe(true);
    expect(
      isBehaviorDeclared(normalized, "GET", "/products", {
        kind: "shape",
        path: "$.next_cursor",
        fingerprint: { path: "$.next_cursor", type: "string" },
      }),
    ).toBe(false);
  });

  it("rejects remote references", () => {
    expect(() =>
      normalizeOpenApiSpec({
        openapi: "3.1.0",
        paths: { "/x": { get: { responses: { "200": { $ref: "https://example.com/x" } } } } },
      }),
    ).toThrow("Remote OpenAPI $ref values are disabled");
  });

  it("rejects cyclic and unresolved local schema references with bounded errors", () => {
    expect(() =>
      normalizeOpenApiSpec({
        openapi: "3.1.0",
        components: {
          schemas: {
            Node: {
              type: "object",
              properties: { child: { $ref: "#/components/schemas/Node" } },
            },
          },
        },
        paths: {
          "/nodes": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Node" } },
                  },
                },
              },
            },
          },
        },
      }),
    ).toThrow(/Cyclic OpenAPI schema reference/);

    expect(() =>
      normalizeOpenApiSpec({
        openapi: "3.1.0",
        paths: {
          "/nodes": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Missing" } },
                  },
                },
              },
            },
          },
        },
      }),
    ).toThrow(/Unresolved OpenAPI schema reference/);
  });

  it("matches concrete request paths to parameterized operations", () => {
    const normalized = normalizeOpenApiSpec({
      openapi: "3.1.0",
      paths: {
        "/customers/{id}": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { id: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(
      isBehaviorDeclared(normalized, "GET", "/customers/cust_01", {
        kind: "shape",
        path: "$.id",
        fingerprint: { type: "string" },
        responseStatus: 200,
      }),
    ).toBe(true);
  });

  it("subtracts fields only from the observed response status", () => {
    const normalized = normalizeOpenApiSpec({
      openapi: "3.1.0",
      paths: {
        "/orders": {
          post: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { id: { type: "string" } } },
                  },
                },
              },
              "201": {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { receipt: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const candidate = {
      kind: "shape" as const,
      path: "$.receipt",
      fingerprint: { type: "string" },
    };
    expect(
      isBehaviorDeclared(normalized, "POST", "/orders", { ...candidate, responseStatus: 200 }),
    ).toBe(false);
    expect(
      isBehaviorDeclared(normalized, "POST", "/orders", { ...candidate, responseStatus: 201 }),
    ).toBe(true);
  });
});
