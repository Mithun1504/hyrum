import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalMachinePepper = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32).optional(),
);
const optionalEncryptionKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be a 32-byte hexadecimal key")
    .optional(),
);

export const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CONTROL_PLANE_HOST: z.string().default("0.0.0.0"),
  CONTROL_PLANE_PORT: z.coerce.number().int().positive().default(4000),
  INTERNAL_OPERATIONS_ENABLED: booleanString,
  WEB_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanString,
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  WORKOS_API_KEY: optionalString,
  WORKOS_WEBHOOK_SECRET: optionalString,
  WORKOS_JWKS_URL: optionalUrl,
  WORKOS_ISSUER: optionalUrl,
  WORKOS_AUDIENCE: optionalString,
  MACHINE_TOKEN_PEPPER: optionalMachinePepper,
  AGENT_KEY_DERIVATION_SECRET: optionalMachinePepper,
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: z.string().min(3).default("hyrum-development"),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: booleanString,
  GITHUB_APP_ID: optionalString,
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_WEBHOOK_SECRET: optionalString,
  GITHUB_ACTIONS_OIDC_AUDIENCE: z.string().min(1).default("hyrum-control-plane"),
  OPENAI_API_KEY: optionalString,
  OPENAI_DEFAULT_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  OPENAI_HIGH_VALUE_MODEL: z.string().min(1).default("gpt-5.6"),
  SLACK_SIGNING_SECRET: optionalString,
  SLACK_BOT_TOKEN: optionalString,
  SLACK_CLIENT_ID: optionalString,
  SLACK_CLIENT_SECRET: optionalString,
  SLACK_OAUTH_REDIRECT_URI: optionalUrl,
  INTEGRATION_TOKEN_ENCRYPTION_KEY: optionalEncryptionKey,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  SENTRY_DSN: optionalUrl,
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const result = runtimeEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
