"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center p-page">
      <Alert variant="destructive">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Hyrum could not render this page</AlertTitle>
        <AlertDescription className="mt-2">
          Retry the page. If it fails again, check the control-plane logs for the request ID.
          <Button className="mt-4" variant="outline" onClick={reset}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}
