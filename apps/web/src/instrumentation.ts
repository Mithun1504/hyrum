import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: true,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
