import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

export type { Logger } from "pino";

const redactPaths = [
  "authorization",
  "apiKey",
  "body",
  "cookie",
  "password",
  "privateKey",
  "prompt",
  "secret",
  "signedUrl",
  "token",
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "*.accessToken",
  "*.apiKey",
  "*.cookie",
  "*.password",
  "*.privateKey",
  "*.signedUrl",
  "*.secret",
  "*.token",
  "*.body",
  "*.prompt",
  "*.headers.authorization",
  "*.headers.cookie",
];

function safeError(error: unknown) {
  if (!(error instanceof Error)) return { name: "Error", message: "Non-error failure" };
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return {
    name: error.name,
    message: error.message.slice(0, 2_000),
    ...(code ? { code } : {}),
    ...(process.env.NODE_ENV !== "production" && error.stack ? { stack: error.stack } : {}),
  };
}

export function createLogger(
  service: string,
  level = process.env.LOG_LEVEL ?? "info",
  options: LoggerOptions = {},
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      base: { service },
      level,
      redact: { paths: redactPaths, censor: "[REDACTED]" },
      serializers: {
        err: safeError,
        error: safeError,
        req: (request: { id?: string; method?: string; url?: string; remoteAddress?: string }) => ({
          id: request.id,
          method: request.method,
          url: request.url?.split("?", 1)[0],
          remoteAddress: request.remoteAddress,
        }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      ...options,
    },
    destination,
  );
}
