"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewLedgerEntryAction } from "./actions";

export function ReviewControl({
  serviceSlug,
  ledgerEntryId,
  tier,
  updatedAt,
}: Readonly<{
  serviceSlug: string;
  ledgerEntryId: string;
  tier: "t1" | "t2" | "t3";
  updatedAt: string;
}>) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"confirmed" | "demoted" | "promoted" | "dismissed">(
    "confirmed",
  );
  const [toTier, setToTier] = useState<"t1" | "t2" | "t3">(
    tier === "t1" ? "t2" : tier === "t2" ? "t3" : "t2",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Review
      </Button>
    );
  }
  return (
    <div className="w-72 space-y-3 rounded-lg border bg-background p-3 shadow-sm">
      <Label htmlFor={`decision-${ledgerEntryId}`}>Decision</Label>
      <select
        id={`decision-${ledgerEntryId}`}
        value={decision}
        onChange={(event) => {
          const next = event.target.value as typeof decision;
          setDecision(next);
          if (next === "promoted") setToTier(tier === "t2" ? "t1" : "t2");
          if (next === "demoted") setToTier(tier === "t1" ? "t2" : "t3");
        }}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
      >
        <option value="confirmed">Confirm evidence</option>
        {tier !== "t3" ? <option value="demoted">Demote tier</option> : null}
        {tier !== "t1" ? <option value="promoted">Promote tier</option> : null}
        <option value="dismissed">Dismiss</option>
      </select>
      {decision === "demoted" || decision === "promoted" ? (
        <>
          <Label htmlFor={`tier-${ledgerEntryId}`}>New tier</Label>
          <select
            id={`tier-${ledgerEntryId}`}
            value={toTier}
            onChange={(event) => setToTier(event.target.value as typeof toTier)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {decision === "promoted" && tier === "t2" ? (
              <option value="t1">T1 proof (requires deterministic echo)</option>
            ) : null}
            {decision === "promoted" && tier === "t3" ? (
              <option value="t2">T2 pattern</option>
            ) : null}
            {decision === "demoted" && tier === "t1" ? (
              <option value="t2">T2 pattern</option>
            ) : null}
            {decision === "demoted" ? <option value="t3">T3 exposure</option> : null}
          </select>
        </>
      ) : null}
      <Label htmlFor={`reason-${ledgerEntryId}`}>Reason</Label>
      <Textarea
        id={`reason-${ledgerEntryId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Explain the review decision"
        rows={3}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              setError(undefined);
              try {
                await reviewLedgerEntryAction({
                  serviceSlug,
                  ledgerEntryId,
                  decision,
                  reason,
                  expectedUpdatedAt: updatedAt,
                  ...(decision === "demoted" || decision === "promoted" ? { toTier } : {}),
                });
                setOpen(false);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Review failed");
              }
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
