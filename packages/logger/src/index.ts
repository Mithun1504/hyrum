import pino, { type Logger, type LoggerOptions } from "pino";

export type { Logger } from "pino";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "*.accessToken",
  "*.apiKey",
  "*.cookie",
  "*.password",
  "*.privateKey",
  "*.secret",
  "*.token",
];

export function createLogger(
  service: string,
  level = process.env.LOG_LEVEL ?? "info",
  options: LoggerOptions = {},
): Logger {
  return pino({
    base: { service },
    level,
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...options,
  });
}
