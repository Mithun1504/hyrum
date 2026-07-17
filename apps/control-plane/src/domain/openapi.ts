export interface NormalizedField {
  path: string;
  required: boolean;
  nullable: boolean;
  types: string[];
}

export interface NormalizedOperation {
  method: string;
  path_template: string;
  operation_id?: string;
  response_fields: NormalizedField[];
  response_fields_by_status?: Record<string, NormalizedField[]>;
  status_codes: string[];
}

export interface NormalizedOpenApiSpec {
  operations: NormalizedOperation[];
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function rejectRemoteRefs(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectRemoteRefs(item);
    return;
  }
  const object = asObject(value);
  if (!object) return;
  const ref = typeof object.$ref === "string" ? object.$ref : undefined;
  if (ref?.startsWith("http://") || ref?.startsWith("https://")) {
    throw new Error("Remote OpenAPI $ref values are disabled");
  }
  for (const item of Object.values(object)) rejectRemoteRefs(item);
}

function resolveLocalRef(document: JsonObject, value: unknown): unknown {
  const object = asObject(value);
  const ref = typeof object?.$ref === "string" ? object.$ref : undefined;
  if (!ref) return value;
  if (!ref.startsWith("#/")) throw new Error("Only local OpenAPI $ref values are supported");
  return ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => {
      const object = asObject(current);
      return object && Object.hasOwn(object, segment) ? object[segment] : undefined;
    }, document);
}

function schemaFields(
  document: JsonObject,
  schema: unknown,
  prefix = "$",
  activeRefs = new Set<string>(),
  budget = { nodes: 0 },
): NormalizedField[] {
  budget.nodes += 1;
  if (budget.nodes > 10_000) throw new Error("OpenAPI schema exceeds the processing budget");

  const source = asObject(schema);
  const ref = typeof source?.$ref === "string" ? source.$ref : undefined;
  if (ref) {
    if (activeRefs.has(ref)) throw new Error(`Cyclic OpenAPI schema reference: ${ref}`);
    const nextRefs = new Set(activeRefs);
    nextRefs.add(ref);
    const resolved = resolveLocalRef(document, source);
    if (resolved === undefined) throw new Error(`Unresolved OpenAPI schema reference: ${ref}`);
    return schemaFields(document, resolved, prefix, nextRefs, budget);
  }

  const resolved = source;
  if (!resolved) return [];
  const type = resolved.type;
  const nullable = resolved.nullable === true || (Array.isArray(type) && type.includes("null"));
  const properties = asObject(resolved.properties);
  if (!properties) return [];
  const required = new Set(Array.isArray(resolved.required) ? resolved.required : []);
  return Object.entries(properties).flatMap(([name, property]) => {
    const path = `${prefix}.${name}`;
    const propertyObject = asObject(resolveLocalRef(document, property));
    const childFields = schemaFields(document, property, path, activeRefs, budget);
    return [
      {
        path,
        required: required.has(name),
        nullable:
          nullable ||
          propertyObject?.nullable === true ||
          (Array.isArray(propertyObject?.type) && propertyObject.type.includes("null")),
        types: Array.isArray(propertyObject?.type)
          ? propertyObject.type.filter((entry): entry is string => typeof entry === "string")
          : typeof propertyObject?.type === "string"
            ? [propertyObject.type]
            : [],
      },
      ...childFields,
    ];
  });
}

function responseFieldsByStatus(document: JsonObject, operation: JsonObject) {
  const responses = asObject(operation.responses);
  if (!responses) return {};
  return Object.fromEntries(
    Object.entries(responses).map(([statusCode, response]) => {
      const content = asObject(asObject(response)?.content);
      const json = asObject(content?.["application/json"]);
      return [statusCode.toUpperCase(), schemaFields(document, json?.schema)];
    }),
  );
}

export function normalizeOpenApiSpec(document: JsonObject): NormalizedOpenApiSpec {
  rejectRemoteRefs(document);
  const paths = asObject(document.paths);
  if (!paths) throw new Error("OpenAPI document must include paths");
  const operations = Object.entries(paths).flatMap(([pathTemplate, pathItem]) => {
    const item = asObject(pathItem);
    if (!item) return [];
    return Object.entries(item)
      .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map(([method, operation]) => {
        const operationObject = asObject(operation) ?? {};
        const operationId =
          typeof operationObject.operationId === "string" ? operationObject.operationId : undefined;
        const fieldsByStatus = responseFieldsByStatus(document, operationObject);
        return {
          method: method.toUpperCase(),
          path_template: pathTemplate,
          ...(operationId ? { operation_id: operationId } : {}),
          response_fields: Object.entries(fieldsByStatus).flatMap(([status, fields]) =>
            /^2\d\d$/.test(status) || status === "2XX" ? fields : [],
          ),
          response_fields_by_status: fieldsByStatus,
          status_codes: Object.keys(asObject(operationObject.responses) ?? {}),
        };
      });
  });
  return { operations };
}

export interface BehaviorDeclarationCandidate {
  kind: "shape" | "ordering" | "error" | "status";
  path: string;
  fingerprint: unknown;
  responseStatus?: number;
}

function pathMatchesTemplate(pathTemplate: string, actualPath: string) {
  const normalize = (value: string) =>
    value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
  const templateParts = normalize(pathTemplate).split("/");
  const actualParts = normalize(actualPath).split("/");
  return (
    templateParts.length === actualParts.length &&
    templateParts.every((part, index) => {
      const actual = actualParts[index];
      return part.startsWith("{") && part.endsWith("}") ? Boolean(actual) : part === actual;
    })
  );
}

function statusIsDeclared(operation: NormalizedOperation, status: number | string) {
  const exact = String(status);
  const statusClass = /^\d{3}$/.test(exact) ? `${exact[0]}XX` : exact.toUpperCase();
  return (
    operation.status_codes.some((candidate) => candidate.toUpperCase() === exact.toUpperCase()) ||
    operation.status_codes.some((candidate) => candidate.toUpperCase() === statusClass) ||
    operation.status_codes.some((candidate) => candidate.toLowerCase() === "default")
  );
}

function responseFieldsForStatus(
  operation: NormalizedOperation,
  status: number | undefined,
): NormalizedField[] {
  if (!status || !operation.response_fields_by_status) return operation.response_fields;
  return (
    operation.response_fields_by_status[String(status)] ??
    operation.response_fields_by_status[`${String(status)[0]}XX`] ??
    operation.response_fields_by_status.default ??
    []
  );
}

function shapeType(candidate: BehaviorDeclarationCandidate) {
  const object = asObject(candidate.fingerprint);
  return typeof object?.type === "string" ? object.type : undefined;
}

export function isBehaviorDeclared(
  normalized: NormalizedOpenApiSpec,
  method: string,
  path: string,
  candidate: BehaviorDeclarationCandidate,
) {
  const operation = normalized.operations.find(
    (candidate) =>
      candidate.method === method.toUpperCase() &&
      pathMatchesTemplate(candidate.path_template, path),
  );
  if (!operation) return false;
  if (candidate.kind === "status") {
    return statusIsDeclared(operation, candidate.path);
  }
  if (candidate.kind !== "shape") {
    return false;
  }
  const declared = responseFieldsForStatus(operation, candidate.responseStatus).find(
    (field) => field.path === candidate.path,
  );
  if (!declared) return false;
  const type = shapeType(candidate);
  if (type === "absent") return !declared.required;
  if (type === "null") return declared.nullable;
  return !type || declared.types.length === 0 || declared.types.includes(type);
}
