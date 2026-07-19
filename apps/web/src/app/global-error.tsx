"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <main className="grid min-h-screen place-items-center p-6">
          <div className="max-w-md rounded-md border p-6">
            <h1 className="text-xl font-semibold">Hyrum could not render this view</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The failure was recorded without request or response payloads.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-sm bg-primary px-4 py-2 text-primary-foreground"
            >
              Retry
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
