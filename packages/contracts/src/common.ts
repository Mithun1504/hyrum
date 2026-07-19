import { z } from "zod";

export const organizationRoleSchema = z.enum(["owner", "admin", "engineer", "viewer"]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const permissionSchema = z.enum([
  "assertion:pin",
  "claim:override",
  "corpus:manage",
  "integration:manage",
  "ledger:read",
  "policy:manage",
]);
export type Permission = z.infer<typeof permissionSchema>;

export const rolePermissions: Readonly<Record<OrganizationRole, readonly Permission[]>> = {
  owner: permissionSchema.options,
  admin: permissionSchema.options,
  engineer: ["assertion:pin", "claim:override", "corpus:manage", "ledger:read"],
  viewer: ["ledger:read"],
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const sessionResponseSchema = z
  .object({
    actorId: z.uuid(),
    organizationId: z.uuid(),
    role: organizationRoleSchema,
  })
  .strict();
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const problemDetailsSchema = z.object({
  type: z.url().default("about:blank"),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  error: z.string(),
  code: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const evidenceTierSchema = z.enum(["T1", "T2", "T3"]);
export type EvidenceTier = z.infer<typeof evidenceTierSchema>;

export const behaviorKindSchema = z.enum(["shape", "ordering", "error", "status"]);
export type BehaviorKind = z.infer<typeof behaviorKindSchema>;

export const isoDateTimeSchema = z.iso.datetime();

export const progressEventTopics = [
  "capture.batch_ingested",
  "ledger.updated",
  "replay.report_ingested",
  "assertion.pinned",
  "assertion.expired",
] as const;
export const progressEventTopic = {
  captureBatchIngested: "capture.batch_ingested",
  ledgerUpdated: "ledger.updated",
  replayReportIngested: "replay.report_ingested",
  assertionPinned: "assertion.pinned",
  assertionExpired: "assertion.expired",
} as const satisfies Record<string, (typeof progressEventTopics)[number]>;
export const progressEventTopicSchema = z.enum(progressEventTopics);
export type ProgressEventTopic = z.infer<typeof progressEventTopicSchema>;

export interface RequestContext {
  requestId: string;
  organizationId: string;
  actorId: string;
  role: OrganizationRole;
  agentId?: string;
  scopes?: string[];
}
