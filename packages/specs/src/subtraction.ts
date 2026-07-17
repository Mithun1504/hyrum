export type ShapeNode = { path: string; type: string };

export interface ShapeClassification {
  status: "declared" | "partially_declared" | "undeclared" | "not_applicable";
  reasonCode: string;
  details: { declaredNodes: ShapeNode[]; undeclaredNodes: ShapeNode[] };
}

export interface BehaviorClassification {
  status: "declared" | "partially_declared" | "undeclared" | "not_applicable";
  reasonCode: string;
  details: Record<string, unknown>;
}

export type BehaviorKind = "shape" | "ordering" | "error_template";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function unescapePointer(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveReference(root: JsonObject, schema: JsonObject, seen: Set<string>): JsonObject {
  const reference = schema.$ref;
  if (typeof reference !== "string" || !reference.startsWith("#/")) return schema;
  if (seen.has(reference)) return {};
  seen.add(reference);
  let current: unknown = root;
  for (const rawSegment of reference.slice(2).split("/")) {
    current = object(current)?.[unescapePointer(rawSegment)];
  }
  return object(current) ?? {};
}

function schemaTypes(schema: JsonObject): string[] {
  const rawType = schema.type;
  const source = Array.isArray(rawType) ? rawType : typeof rawType === "string" ? [rawType] : [];
  const result = source.map((type) => (type === "integer" ? "number" : type));
  if (schema.nullable === true && !result.includes("null")) result.push("null");
  if (result.length === 0 && object(schema.properties)) result.push("object");
  return result;
}

function collectAllowedNodes(
  root: JsonObject,
  input: JsonObject,
  path: string,
  nodes: Set<string>,
  wildcards: Set<string>,
  seen: Set<string>,
): void {
  const schema = resolveReference(root, input, seen);
  for (const branchKey of ["allOf", "oneOf", "anyOf"] as const) {
    const branches = schema[branchKey];
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        const child = object(branch);
        if (child) collectAllowedNodes(root, child, path, nodes, wildcards, new Set(seen));
      }
    }
  }
  const types = schemaTypes(schema);
  for (const type of types) nodes.add(`${path}\u0000${type}`);
  if (types.includes("object")) {
    const properties = object(schema.properties) ?? {};
    for (const [name, childValue] of Object.entries(properties)) {
      const child = object(childValue);
      if (child) {
        const escaped = name.replaceAll("~", "~0").replaceAll("/", "~1");
        collectAllowedNodes(root, child, `${path}/${escaped}`, nodes, wildcards, new Set(seen));
      }
    }
    const additional = schema.additionalProperties;
    if (additional === true) wildcards.add(`${path}/*`);
    const additionalSchema = object(additional);
    if (additionalSchema) {
      wildcards.add(`${path}/*`);
      collectAllowedNodes(root, additionalSchema, `${path}/*`, nodes, wildcards, new Set(seen));
    }
  }
  if (types.includes("array")) {
    const items = object(schema.items);
    if (items) collectAllowedNodes(root, items, `${path}/*`, nodes, wildcards, new Set(seen));
  }
}

function wildcardAllows(path: string, wildcards: ReadonlySet<string>): boolean {
  for (const wildcard of wildcards) {
    const prefix = wildcard.slice(0, -1);
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

export function classifyShapeFingerprint(
  canonical: unknown,
  normalizedContract: unknown,
): ShapeClassification {
  const fingerprint = object(canonical);
  const contract = object(normalizedContract);
  const status = fingerprint?.status;
  const rawNodes = fingerprint?.nodes;
  if (!contract || typeof status !== "number" || !Array.isArray(rawNodes)) {
    return {
      status: "not_applicable",
      reasonCode: "invalid_shape_or_contract",
      details: { declaredNodes: [], undeclaredNodes: [] },
    };
  }
  const operation = object(contract.operation);
  const responses = object(operation?.responses);
  const response = object(responses?.[String(status)] ?? responses?.default);
  if (!response) {
    return {
      status: "undeclared",
      reasonCode: "response_status_not_declared",
      details: {
        declaredNodes: [],
        undeclaredNodes: rawNodes.flatMap((node) => {
          const value = object(node);
          return typeof value?.path === "string" && typeof value.type === "string"
            ? [{ path: value.path, type: value.type }]
            : [];
        }),
      },
    };
  }
  const content = object(response.content);
  const media =
    object(content?.["application/json"]) ??
    Object.entries(content ?? {}).find(([name]) => name.endsWith("+json"))?.[1];
  const schema = object(object(media)?.schema);
  if (!schema) {
    const nodes = rawNodes.flatMap((node) => {
      const value = object(node);
      return typeof value?.path === "string" && typeof value.type === "string"
        ? [{ path: value.path, type: value.type }]
        : [];
    });
    const bodyless = nodes.length === 1 && nodes[0]?.path === "$" && nodes[0]?.type === "null";
    return {
      status: bodyless ? "declared" : "undeclared",
      reasonCode: bodyless ? "bodyless_response_declared" : "response_body_not_declared",
      details: { declaredNodes: bodyless ? nodes : [], undeclaredNodes: bodyless ? [] : nodes },
    };
  }
  const root = { components: contract.components };
  const allowed = new Set<string>();
  const wildcards = new Set<string>();
  collectAllowedNodes(root, schema, "$", allowed, wildcards, new Set());
  const declaredNodes: ShapeNode[] = [];
  const undeclaredNodes: ShapeNode[] = [];
  for (const node of rawNodes) {
    const value = object(node);
    if (typeof value?.path !== "string" || typeof value.type !== "string") continue;
    const normalized = { path: value.path, type: value.type };
    if (
      allowed.has(`${normalized.path}\u0000${normalized.type}`) ||
      wildcardAllows(normalized.path, wildcards)
    ) {
      declaredNodes.push(normalized);
    } else {
      undeclaredNodes.push(normalized);
    }
  }
  if (undeclaredNodes.length === 0) {
    return {
      status: "declared",
      reasonCode: "all_observed_nodes_declared",
      details: { declaredNodes, undeclaredNodes },
    };
  }
  return {
    status: declaredNodes.length > 0 ? "partially_declared" : "undeclared",
    reasonCode: "observed_nodes_not_declared",
    details: { declaredNodes, undeclaredNodes },
  };
}

function responseForCanonical(canonical: JsonObject, contract: JsonObject): JsonObject | null {
  const status = canonical.status;
  if (typeof status !== "number") return null;
  const operation = object(contract.operation);
  const responses = object(operation?.responses);
  return object(responses?.[String(status)] ?? responses?.default);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = object(value);
  if (record) {
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function classifyOrdering(canonical: unknown, normalizedContract: unknown): BehaviorClassification {
  const fingerprint = object(canonical);
  const contract = object(normalizedContract);
  const candidates = fingerprint?.candidates;
  if (!contract || !Array.isArray(candidates)) {
    return { status: "not_applicable", reasonCode: "invalid_ordering_or_contract", details: {} };
  }
  const operation = object(contract.operation);
  const declared = operation?.["x-hyrum-ordering"];
  if (!Array.isArray(declared)) {
    return {
      status: "undeclared",
      reasonCode: "response_ordering_not_declared",
      details: { observedCandidates: candidates },
    };
  }
  const declaredSet = new Set(declared.map(canonicalJson));
  const matched = candidates.filter((candidate) => declaredSet.has(canonicalJson(candidate)));
  return {
    status:
      matched.length === candidates.length
        ? "declared"
        : matched.length > 0
          ? "partially_declared"
          : "undeclared",
    reasonCode:
      matched.length === candidates.length
        ? "ordering_extension_matches"
        : "ordering_extension_mismatch",
    details: { observedCandidates: candidates, matchedCandidates: matched },
  };
}

function classifyErrorTemplate(
  canonical: unknown,
  normalizedContract: unknown,
): BehaviorClassification {
  const fingerprint = object(canonical);
  const contract = object(normalizedContract);
  if (!fingerprint || !contract || !("template" in fingerprint)) {
    return {
      status: "not_applicable",
      reasonCode: "invalid_error_template_or_contract",
      details: {},
    };
  }
  const response = responseForCanonical(fingerprint, contract);
  if (!response) {
    return {
      status: "undeclared",
      reasonCode: "error_status_not_declared",
      details: { status: fingerprint.status },
    };
  }
  const content = object(response.content);
  const media =
    object(content?.["application/json"]) ??
    Object.entries(content ?? {}).find(([name]) => name.endsWith("+json"))?.[1];
  const mediaObject = object(media);
  const declaredTemplate =
    response["x-hyrum-error-template"] ?? mediaObject?.["x-hyrum-error-template"];
  if (
    declaredTemplate !== undefined &&
    canonicalJson(declaredTemplate) === canonicalJson(fingerprint.template)
  ) {
    return {
      status: "declared",
      reasonCode: "error_template_extension_matches",
      details: { status: fingerprint.status },
    };
  }
  return {
    status: "partially_declared",
    reasonCode: "error_status_declared_template_undeclared",
    details: { status: fingerprint.status, exactTemplateDeclared: false },
  };
}

export function classifyBehaviorFingerprint(
  kind: "shape" | "ordering" | "error_template",
  canonical: unknown,
  normalizedContract: unknown,
): BehaviorClassification {
  if (kind === "shape") {
    const result = classifyShapeFingerprint(canonical, normalizedContract);
    return { status: result.status, reasonCode: result.reasonCode, details: result.details };
  }
  if (kind === "ordering") return classifyOrdering(canonical, normalizedContract);
  return classifyErrorTemplate(canonical, normalizedContract);
}
