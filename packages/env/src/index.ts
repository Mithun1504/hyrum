import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const trueBooleanString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalSlackBotToken = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().startsWith("xoxb-").optional(),
);

export const runtimeEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    CONTROL_PLANE_HOST: z.string().default("0.0.0.0"),
    CONTROL_PLANE_PORT: z.coerce.number().int().positive().default(4000),
    CONTROL_PLANE_TRUST_PROXY_CIDRS: optionalString,
    WEB_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    WORKER_DATABASE_URL: optionalString,
    WORKOS_CLIENT_ID: optionalString,
    WORKOS_API_KEY: optionalString,
    WORKOS_JWKS_URL: optionalUrl,
    WORKOS_ISSUER: optionalUrl,
    GITHUB_APP_ID: optionalString,
    GITHUB_APP_PRIVATE_KEY: optionalString,
    SLACK_BOT_TOKEN: optionalSlackBotToken,
    DATABASE_SSL: booleanString,
    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
    OBJECT_STORAGE_ENDPOINT: z.url().default("http://127.0.0.1:9000"),
    OBJECT_STORAGE_REGION: z.string().min(1).default("us-east-1"),
    OBJECT_STORAGE_BUCKET: z.string().min(3).default("hyrum-development"),
    OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1).default("minioadmin"),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).default("minioadmin"),
    OBJECT_STORAGE_FORCE_PATH_STYLE: trueBooleanString,
    OBJECT_STORAGE_MAX_OBJECT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024)
      .default(25 * 1024 * 1024),
    OBJECT_STORAGE_PRESIGN_MAX_SECONDS: z.coerce.number().int().positive().max(900).default(300),
    OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: z
      .enum(["bucket", "AES256", "aws:kms"])
      .default("bucket"),
    OBJECT_STORAGE_KMS_KEY_ID: optionalString,
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
    SENTRY_DSN: optionalUrl,
  })
  .superRefine((env, context) => {
    if (Boolean(env.GITHUB_APP_ID) !== Boolean(env.GITHUB_APP_PRIVATE_KEY)) {
      context.addIssue({
        code: "custom",
        message: "GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be configured together",
        path: [env.GITHUB_APP_ID ? "GITHUB_APP_PRIVATE_KEY" : "GITHUB_APP_ID"],
      });
    }
    if (env.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION === "aws:kms" && !env.OBJECT_STORAGE_KMS_KEY_ID) {
      context.addIssue({
        code: "custom",
        message: "OBJECT_STORAGE_KMS_KEY_ID is required for aws:kms object storage encryption",
        path: ["OBJECT_STORAGE_KMS_KEY_ID"],
      });
    }

    if (env.NODE_ENV !== "production") return;
    if (!env.DATABASE_SSL) {
      context.addIssue({
        code: "custom",
        message: "DATABASE_SSL must be true in production",
        path: ["DATABASE_SSL"],
      });
    }
    const endpoint = new URL(env.OBJECT_STORAGE_ENDPOINT);
    if (endpoint.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "OBJECT_STORAGE_ENDPOINT must use https in production",
        path: ["OBJECT_STORAGE_ENDPOINT"],
      });
    }
    for (const [key, value] of [
      ["OBJECT_STORAGE_BUCKET", env.OBJECT_STORAGE_BUCKET],
      ["OBJECT_STORAGE_ACCESS_KEY_ID", env.OBJECT_STORAGE_ACCESS_KEY_ID],
      ["OBJECT_STORAGE_SECRET_ACCESS_KEY", env.OBJECT_STORAGE_SECRET_ACCESS_KEY],
    ] as const) {
      if (value === "hyrum-development" || value === "minioadmin") {
        context.addIssue({
          code: "custom",
          message: `${key} must be set to a production value`,
          path: [key],
        });
      }
    }
  });

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const result = runtimeEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
