"use client";

import { RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Workspace data could not be loaded</AlertTitle>
        <AlertDescription className="mt-2">
          Check the control-plane connection or retry the authenticated dashboard request.
        </AlertDescription>
        <Button type="button" variant="outline" className="mt-4 gap-2" onClick={reset}>
          <RotateCcw aria-hidden="true" />
          Retry
        </Button>
      </Alert>
    </main>
  );
}
