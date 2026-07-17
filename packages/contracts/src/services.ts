import { z } from "zod";
import { pageInfoSchema } from "./http";

export const serviceStatusSchema = z.enum(["onboarding", "active", "paused", "archived"]);
export const environmentKindSchema = z.enum(["production", "staging", "development", "demo"]);
export type EnvironmentKind = z.infer<typeof environmentKindSchema>;

export const serviceSlugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens");

const originSchema = z.url().superRefine((value, context) => {
  const parsed = new URL(value);
  if (
    parsed.origin !== value ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    context.addIssue({
      code: "custom",
      message: "Must be an HTTP(S) origin without credentials, path, query, or fragment",
    });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    context.addIssue({ code: "custom", message: "Only HTTP and HTTPS origins are supported" });
  }
});

export const createServiceRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  slug: serviceSlugSchema,
  description: z.string().trim().max(1_000).nullable().optional(),
  environment: z.strictObject({
    name: z.string().trim().min(2).max(100).default("Production"),
    slug: serviceSlugSchema.default("production"),
    kind: environmentKindSchema.default("production"),
    baseUrlOrigin: originSchema.nullable().optional(),
  }),
});
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;

export const serviceEnvironmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  kind: environmentKindSchema,
  baseUrlOrigin: z.string().nullable(),
  captureEnabled: z.boolean(),
  isDefault: z.boolean(),
});

export const apiServiceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: serviceStatusSchema,
  ownerMembershipId: z.uuid(),
  firstCaptureAt: z.iso.datetime().nullable(),
  firstUsefulLedgerAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  defaultEnvironment: serviceEnvironmentSchema,
});
export type ApiService = z.infer<typeof apiServiceSchema>;

export const serviceIdentifierSchema = z.union([z.uuid(), serviceSlugSchema]);
export const servicePathParamsSchema = z.strictObject({
  identifier: serviceIdentifierSchema,
});

export const serviceListSchema = z.object({
  data: z.array(apiServiceSchema),
  page: pageInfoSchema,
});

export const uploadSpecificationRequestSchema = z.strictObject({
  versionLabel: z.string().trim().min(1).max(100),
  document: z
    .string()
    .min(1)
    .max(2 * 1024 * 1024),
});
export type UploadSpecificationRequest = z.infer<typeof uploadSpecificationRequestSchema>;

export const apiSpecOperationSchema = z.object({
  id: z.uuid(),
  httpMethod: z.string(),
  normalizedPathTemplate: z.string(),
  operationKey: z.string(),
  operationId: z.string().nullable(),
  summary: z.string().nullable(),
  contractDigest: z.string(),
});

export const apiSpecificationSchema = z.object({
  id: z.uuid(),
  apiServiceId: z.uuid(),
  versionLabel: z.string(),
  source: z.enum(["upload", "github", "generated_draft"]),
  originalDigest: z.string(),
  normalizedDigest: z.string(),
  openapiVersion: z.string(),
  validationStatus: z.enum(["pending", "valid", "invalid", "failed"]),
  validationErrors: z.array(z.string()),
  isCurrent: z.boolean(),
  supersedesSpecId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  operations: z.array(apiSpecOperationSchema),
});
export type ApiSpecification = z.infer<typeof apiSpecificationSchema>;

export const specificationUploadResponseSchema = z.object({
  created: z.boolean(),
  specification: apiSpecificationSchema,
});
