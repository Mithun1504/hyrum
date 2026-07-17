"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getReceiptAccess } from "./actions";

export function ReceiptButton({ receiptId }: Readonly<{ receiptId: string }>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            try {
              const url = await getReceiptAccess(receiptId);
              window.open(url, "_blank", "noopener,noreferrer");
            } catch {
              setError("Receipt unavailable");
            }
          })
        }
      >
        <ExternalLink aria-hidden="true" />
        {pending ? "Authorizing…" : "View receipt"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
