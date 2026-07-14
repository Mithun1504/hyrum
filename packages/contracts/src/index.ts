import { z } from "zod";

export const organizationRoleSchema = z.enum(["owner", "admin", "engineer", "viewer"]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const permissionSchema = z.enum([
  "assertion:pin",
  "claim:override",
  "integration:manage",
  "ledger:read",
  "policy:manage",
]);
export type Permission = z.infer<typeof permissionSchema>;

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const problemDetailsSchema = z.object({
  type: z.url().default("about:blank"),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export interface RequestContext {
  requestId: string;
  organizationId: string;
  actorId: string;
  role: OrganizationRole;
}
