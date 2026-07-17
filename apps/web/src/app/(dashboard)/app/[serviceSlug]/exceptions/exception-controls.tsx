"use client";

import type { GateException } from "@hyrum/contracts";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveGateExceptionAction, requestGateExceptionAction } from "./actions";

function localInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function RequestExceptionControl({
  serviceSlug,
  gateImpactId,
}: Readonly<{ serviceSlug: string; gateImpactId: string }>) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setValidUntil(localInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));
          setOpen(true);
        }}
      >
        Request exact exception
      </Button>
    );
  }

  return (
    <form
      className="mt-4 space-y-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(undefined);
        startTransition(async () => {
          try {
            await requestGateExceptionAction(serviceSlug, gateImpactId, {
              reason,
              validUntil: new Date(validUntil).toISOString(),
            });
            setOpen(false);
            setReason("");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not request exception");
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`exception-expiry-${gateImpactId}`}>Expires</Label>
        <Input
          id={`exception-expiry-${gateImpactId}`}
          type="datetime-local"
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`exception-reason-${gateImpactId}`}>Reason and migration safeguard</Label>
        <Textarea
          id={`exception-reason-${gateImpactId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={2000}
          required
          placeholder="Explain why this exact candidate is safe and how affected consumers are protected."
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending}>
          {pending ? "Requesting…" : "Request"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ApproveExceptionControl({
  serviceSlug,
  exception,
  canApprove,
}: Readonly<{ serviceSlug: string; exception: GateException; canApprove: boolean }>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  if (exception.status !== "pending" || !canApprove) return null;
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            try {
              await approveGateExceptionAction(serviceSlug, exception.id);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not approve exception");
            }
          });
        }}
      >
        {pending ? "Approving…" : "Approve exception"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
