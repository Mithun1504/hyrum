import { createHash } from "node:crypto";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI } from "openapi-types";
import { parse as parseYaml } from "yaml";

export * from "./subtraction";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export interface NormalizedOperation {
  httpMethod: string;
  normalizedPathTemplate: string;
  operationKey: string;
  operationId: string | null;
  summary: string | null;
  normalizedContract: Record<string, unknown>;
  contractDigest: string;
}

export interface NormalizedSpecification {
  originalBytes: Uint8Array;
  originalDigest: string;
  normalizedBytes: Uint8Array;
  normalizedDigest: string;
  openapiVersion: string;
  normalizedDocument: Record<string, unknown>;
  operations: NormalizedOperation[];
}

export class SpecificationValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: readonly string[],
  ) {
    super(message);
    this.name = "SpecificationValidationError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rejectExternalReferences(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      rejectExternalReferences(entry, `${path}[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$ref" && typeof child === "string" && !child.startsWith("#")) {
      throw new SpecificationValidationError("External OpenAPI references are disabled", [
        `${path}.$ref must be a local fragment`,
      ]);
    }
    rejectExternalReferences(child, `${path}.${key}`);
  }
}

function normalizePathTemplate(path: string): string {
  const normalized = `/${path}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return normalized.replace(/\{[^}/]+\}/g, "{}");
}

function operationDigest(method: string, path: string): string {
  return digest(`${method.toUpperCase()} ${path}`);
}

function extractOperations(document: Record<string, unknown>): NormalizedOperation[] {
  const paths = document.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) return [];
  const components =
    document.components &&
    typeof document.components === "object" &&
    !Array.isArray(document.components)
      ? document.components
      : {};
  const operations: NormalizedOperation[] = [];
  for (const [rawPath, pathItemValue] of Object.entries(paths as Record<string, unknown>)) {
    if (!pathItemValue || typeof pathItemValue !== "object" || Array.isArray(pathItemValue))
      continue;
    const pathItem = pathItemValue as Record<string, unknown>;
    for (const method of HTTP_METHODS) {
      const operationValue = pathItem[method];
      if (!operationValue || typeof operationValue !== "object" || Array.isArray(operationValue)) {
        continue;
      }
      const operation = operationValue as Record<string, unknown>;
      const normalizedPathTemplate = normalizePathTemplate(rawPath);
      const normalizedContract = canonicalize({
        components,
        operation,
        pathParameters: Array.isArray(pathItem.parameters) ? pathItem.parameters : [],
      }) as Record<string, unknown>;
      const contractJson = canonicalJson(normalizedContract);
      operations.push({
        httpMethod: method.toUpperCase(),
        normalizedPathTemplate,
        operationKey: operationDigest(method, normalizedPathTemplate),
        operationId: typeof operation.operationId === "string" ? operation.operationId : null,
        summary: typeof operation.summary === "string" ? operation.summary : null,
        normalizedContract,
        contractDigest: digest(contractJson),
      });
    }
  }
  return operations.sort((left, right) =>
    `${left.normalizedPathTemplate}:${left.httpMethod}`.localeCompare(
      `${right.normalizedPathTemplate}:${right.httpMethod}`,
    ),
  );
}

export async function normalizeSpecification(
  source: string | Uint8Array,
  maximumBytes = 2 * 1024 * 1024,
): Promise<NormalizedSpecification> {
  const originalBytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
  if (originalBytes.byteLength === 0) {
    throw new SpecificationValidationError("OpenAPI document is empty", ["Document is empty"]);
  }
  if (originalBytes.byteLength > maximumBytes) {
    throw new SpecificationValidationError("OpenAPI document exceeds the size limit", [
      `Maximum size is ${maximumBytes} bytes`,
    ]);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(new TextDecoder("utf-8", { fatal: true }).decode(originalBytes));
  } catch (error) {
    throw new SpecificationValidationError("OpenAPI document could not be parsed", [
      error instanceof Error ? error.message : "Invalid UTF-8, JSON, or YAML",
    ]);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SpecificationValidationError("OpenAPI document must be an object", [
      "Root value must be an object",
    ]);
  }
  const document = parsed as Record<string, unknown>;
  const version = document.openapi;
  if (typeof version !== "string" || !version.startsWith("3.")) {
    throw new SpecificationValidationError("Only OpenAPI 3.x documents are supported", [
      "openapi must start with 3.",
    ]);
  }
  rejectExternalReferences(document);
  try {
    await SwaggerParser.validate(structuredClone(document) as OpenAPI.Document, {
      resolve: { external: false },
      dereference: { circular: "ignore" },
      validate: { schema: true, spec: true },
    });
  } catch (error) {
    throw new SpecificationValidationError("OpenAPI validation failed", [
      error instanceof Error ? error.message : "Unknown validation error",
    ]);
  }

  const normalizedDocument = canonicalize(document) as Record<string, unknown>;
  const normalizedBytes = new TextEncoder().encode(canonicalJson(normalizedDocument));
  return {
    originalBytes,
    originalDigest: digest(originalBytes),
    normalizedBytes,
    normalizedDigest: digest(normalizedBytes),
    openapiVersion: version,
    normalizedDocument,
    operations: extractOperations(normalizedDocument),
  };
}
