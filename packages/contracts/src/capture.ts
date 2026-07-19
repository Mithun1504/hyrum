import { z } from "zod";
import { isoDateTimeSchema } from "./common";

const headersSchema = z.record(z.string(), z.string()).optional();
const querySchema = z.record(z.string(), z.unknown()).optional();
const captureContractVersionSchema = z.literal("1.0.0");
const redactionVersionSchema = z.literal("2.0.0");
const redactedValue = "[REDACTED]";
const structuralToken = /^hmac-sha256:(string|number|boolean):[a-f0-9]{64}$/;
const structuralStringToken = /^hmac-sha256:string:[a-f0-9]{64}$/;
const sensitiveNames = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "client_secret",
  "credential",
  "signature",
  "x-api-key",
]);
function isSensitiveName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return (
    sensitiveNames.has(lower) ||
    lower.includes("authorization") ||
    lower.includes("signature") ||
    lower.includes("credential") ||
    lower.includes("api-key") ||
    lower.endsWith("_token") ||
    lower.endsWith("-token")
  );
}

function validateRedactedValue(
  value: unknown,
  context: z.RefinementCtx,
  path: PropertyKey[] = [],
  depth = 0,
): void {
  if (depth > 32) {
    context.addIssue({
      code: "custom",
      message: "capture value exceeds maximum redaction depth",
      path,
    });
    return;
  }
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value !== redactedValue && !structuralToken.test(value)) {
      context.addIssue({
        code: "custom",
        message: "capture scalar must be an exact v2 structural token or redaction marker",
        path,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateRedactedValue(item, context, [...path, index], depth + 1);
    });
    return;
  }
  if (typeof value !== "object") {
    context.addIssue({
      code: "custom",
      message: "capture contains an unsupported unredacted scalar",
      path,
    });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveName(key) && child !== redactedValue) {
      context.addIssue({
        code: "custom",
        message: `sensitive field ${key} must be redacted`,
        path: [...path, key],
      });
      continue;
    }
    validateRedactedValue(child, context, [...path, key], depth + 1);
  }
}

function isStructuralPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.includes("?") &&
    !value.includes("#") &&
    value
      .split("/")
      .slice(1)
      .every((segment) => segment === "" || structuralStringToken.test(segment))
  );
}

function isSafePathTemplate(value: string): boolean {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) return false;
  if (value === "/") return true;
  const normalized = value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
  return normalized
    .split("/")
    .slice(1)
    .every(
      (segment) =>
        /^[A-Za-z0-9._~-]{1,128}$/.test(segment) ||
        /^\{[A-Za-z][A-Za-z0-9._-]{0,63}\}$/.test(segment),
    );
}

function validateHeaders(
  headers: Record<string, string> | undefined,
  context: z.RefinementCtx,
  path: PropertyKey[],
): void {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value !== redactedValue) {
      context.addIssue({
        code: "custom",
        message: `header ${name} value must be dropped`,
        path: [...path, name],
      });
    }
  }
}

export const captureHttpRequestSchema = z
  .object({
    method: z.string().min(1),
    path: z.string().min(1),
    path_template: z.string().optional(),
    query: querySchema,
    headers: headersSchema,
    body: z.unknown().optional(),
  })
  .strict();

export const captureHttpResponseSchema = z
  .object({
    status: z.number().int().min(100).max(599),
    headers: headersSchema,
    body: z.unknown().optional(),
  })
  .strict();

export const captureInputEventSchema = z
  .object({
    organization_id: z.uuid(),
    event_id: z.string().min(1).max(200),
    session_id: z.string().min(1).max(200),
    consumer_value: z.string().min(1),
    sequence: z.number().int().positive(),
    session_complete: z.boolean(),
    occurred_at: isoDateTimeSchema,
    request: captureHttpRequestSchema,
    response: captureHttpResponseSchema,
  })
  .strict();
export type CaptureInputEvent = z.infer<typeof captureInputEventSchema>;

export const behaviorFingerprintSchema = z
  .object({
    version: z.enum(["1.0.0", "1.1.0"]),
    status: z.number().int().min(100).max(599),
    shape: z.array(z.object({ path: z.string(), type: z.string() }).strict()),
    presence: z
      .array(
        z
          .object({
            path: z.string(),
            states: z.array(z.enum(["absent", "null", "present"])).min(1),
          })
          .strict(),
      )
      .optional(),
    enums: z
      .array(
        z
          .object({
            path: z.string(),
            values: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(32),
            truncated: z.boolean().optional(),
          })
          .strict(),
      )
      .optional(),
    error: z
      .object({ status: z.number().int(), template: z.string(), digest: z.string().min(1) })
      .strict()
      .optional(),
    ordering: z
      .array(
        z
          .object({
            path: z.string(),
            values: z.array(z.string()),
            cross_page_stable: z.boolean().optional(),
            page_samples: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .optional(),
    masking: z.array(z.string()).optional(),
  })
  .strict();
export type BehaviorFingerprint = z.infer<typeof behaviorFingerprintSchema>;

export const captureEvidenceSchema = z.discriminatedUnion("tier", [
  z
    .object({
      tier: z.literal("T1"),
      echo: z
        .object({
          token_hash: z.string().min(1),
          response_event_id: z.string().min(1).max(200),
          request_event_id: z.string().min(1).max(200),
          response_sequence: z.number().int().positive(),
          request_sequence: z.number().int().positive(),
          request_method: z.string().min(1).max(32),
          request_path: z.string().startsWith("/").max(2_000),
          response_paths: z.array(z.string()).min(1),
          request_paths: z.array(z.string()).min(1),
        })
        .refine((echo) => echo.response_sequence < echo.request_sequence, {
          message: "T1 echo request_sequence must follow response_sequence",
          path: ["request_sequence"],
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      tier: z.literal("T2"),
      pattern: z
        .object({
          status: z.number().int().min(100).max(599),
          error_template: z.string().min(1),
          next_request: z.string().min(1),
          support: z.number().int().positive(),
          confounder_notes: z.array(z.string()),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      tier: z.literal("T3"),
      exposure: z
        .object({
          behavior_kind: z.enum(["shape", "ordering", "error", "status"]),
          behavior_path: z.string().min(1),
          count: z.number().int().positive(),
        })
        .strict(),
    })
    .strict(),
]);
export type CaptureEvidence = z.infer<typeof captureEvidenceSchema>;

export const agentCaptureEventSchema = captureInputEventSchema
  .omit({ consumer_value: true })
  .extend({
    consumer_id: z.string().min(1).max(200),
    version: captureContractVersionSchema,
    redaction_version: redactionVersionSchema,
    fingerprint: behaviorFingerprintSchema,
    evidence: z.array(captureEvidenceSchema).default([]),
  })
  .strict()
  .superRefine((event, context) => {
    if (!isStructuralPath(event.request.path)) {
      context.addIssue({
        code: "custom",
        message: "request path must contain only v2 structural string tokens",
        path: ["request", "path"],
      });
    }
    if (event.request.path_template && !isSafePathTemplate(event.request.path_template)) {
      context.addIssue({
        code: "custom",
        message: "request path_template must be a safe configured operation template",
        path: ["request", "path_template"],
      });
    }
    validateHeaders(event.request.headers, context, ["request", "headers"]);
    validateHeaders(event.response.headers, context, ["response", "headers"]);
    validateRedactedValue(event.request.query, context, ["request", "query"]);
    validateRedactedValue(event.request.body, context, ["request", "body"]);
    validateRedactedValue(event.response.body, context, ["response", "body"]);
    if (event.fingerprint.error) {
      if (event.fingerprint.error.template !== "{masked}") {
        validateRedactedValue(event.fingerprint.error.template, context, [
          "fingerprint",
          "error",
          "template",
        ]);
      }
    }
    for (const evidence of event.evidence) {
      if (evidence.tier === "T2") {
        validateRedactedValue(evidence.pattern.error_template, context, [
          "evidence",
          "pattern",
          "error_template",
        ]);
        if (!isStructuralPath(evidence.pattern.next_request.split(" ").slice(1).join(" "))) {
          context.addIssue({
            code: "custom",
            message: "T2 next request path must be structurally redacted",
            path: ["evidence", "pattern", "next_request"],
          });
        }
        continue;
      }
      if (evidence.tier !== "T1") continue;
      if (!structuralStringToken.test(evidence.echo.token_hash)) {
        context.addIssue({
          code: "custom",
          message: "T1 token_hash must be an exact v2 string token",
          path: ["evidence", "echo", "token_hash"],
        });
      }
      if (!isStructuralPath(evidence.echo.request_path)) {
        context.addIssue({
          code: "custom",
          message: "T1 request path must be structurally redacted",
          path: ["evidence", "echo", "request_path"],
        });
      }
      if (evidence.echo.response_event_id !== event.event_id) {
        context.addIssue({
          code: "custom",
          message: "T1 echo response_event_id must match the enclosing capture event",
          path: ["evidence", "response_event_id"],
        });
      }
      if (evidence.echo.response_sequence !== event.sequence) {
        context.addIssue({
          code: "custom",
          message: "T1 echo response_sequence must match the enclosing capture event",
          path: ["evidence", "response_sequence"],
        });
      }
    }
  });
export type AgentCaptureEvent = z.infer<typeof agentCaptureEventSchema>;

export const captureBatchSchema = z
  .object({
    batch_id: z.string().min(1).max(200),
    events: z.array(agentCaptureEventSchema).min(1).max(1_000),
  })
  .strict();
export type CaptureBatch = z.infer<typeof captureBatchSchema>;

export const batchItemResultSchema = z
  .object({
    event_id: z.string(),
    status: z.enum(["accepted", "duplicate", "ignored_declared", "rejected"]),
    code: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

export const captureBatchResponseSchema = z
  .object({
    batch_id: z.string(),
    accepted_count: z.number().int().nonnegative(),
    rejected_count: z.number().int().nonnegative(),
    results: z.array(batchItemResultSchema),
  })
  .strict();
export type CaptureBatchResponse = z.infer<typeof captureBatchResponseSchema>;
