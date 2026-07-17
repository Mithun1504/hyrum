"use client";

import { Pin, ShieldAlert } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type MutationState = {
  status: "idle" | "success" | "error";
  message: string;
};

type AssertionPinFormProps = {
  behaviorId: string;
  claimId: string;
  canPin: boolean;
  permissionReason: string | null;
  defaultExpiry: string;
  pinAction: (previous: MutationState, formData: FormData) => Promise<MutationState>;
};

const initialState: MutationState = { status: "idle", message: "" };

export function AssertionPinForm({
  behaviorId,
  claimId,
  canPin,
  permissionReason,
  defaultExpiry,
  pinAction,
}: AssertionPinFormProps) {
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(pinAction, initialState);
  const expiryDate = useMemo(() => defaultExpiry.slice(0, 10), [defaultExpiry]);
  const reasonError = reason.trim().length === 0 ? "Add a reason before pinning." : null;

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-border bg-industrial-3 p-4"
    >
      <input type="hidden" name="behavior_id" value={behaviorId} />
      <input type="hidden" name="claim_id" value={claimId} />
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-tier-pattern/15 text-tier-pattern">
          <ShieldAlert className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-sans text-sm font-bold">Pin as assertion</h3>
          <p className="text-[11px] text-muted-foreground">
            Default expiry is 90 days. The behavior becomes a replay test on every CI run.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="assertion-reason"
          className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          Reason
        </label>
        <textarea
          id="assertion-reason"
          name="reason"
          rows={3}
          value={reason}
          disabled={!canPin}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          className="min-h-24 resize-y rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none transition-colors duration-150 ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Customer migration window for support importer."
          aria-invalid={Boolean(reasonError && reason.length > 0)}
          aria-describedby="assertion-reason-help"
        />
        <p id="assertion-reason-help" className="text-[11px] text-muted-foreground">
          {canPin
            ? (reasonError ?? "This reason is stored with the assertion history.")
            : permissionReason}
        </p>
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="assertion-expiry"
          className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          Expiry
        </label>
        <input
          id="assertion-expiry"
          name="expires_at"
          type="date"
          value={expiryDate}
          readOnly
          className="h-11 rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <Button
        type="submit"
        disabled={!canPin || Boolean(reasonError) || pending}
        className="w-fit gap-2"
      >
        <Pin aria-hidden="true" />
        {pending ? "Pinning assertion" : "Pin assertion"}
      </Button>
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "error"
              ? "text-[11px] text-destructive"
              : "text-[11px] text-tier-proof"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
