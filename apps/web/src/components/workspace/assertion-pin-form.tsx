"use client";

import { Pin } from "lucide-react";
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
    <form action={action} className="grid gap-4 rounded-md border border-border bg-card p-4">
      <input type="hidden" name="behavior_id" value={behaviorId} />
      <input type="hidden" name="claim_id" value={claimId} />
      <div>
        <h3 className="text-sm font-semibold">Pin as a compatibility assertion</h3>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          Record why this behavior must stay compatible. Hyrum will enforce it during replay until
          the 90-day review date.
        </p>
      </div>

      <div className="grid gap-2">
        <label htmlFor="assertion-reason" className="text-xs font-medium text-foreground">
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
          className="min-h-24 resize-y rounded-[4px] border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
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
        <label htmlFor="assertion-expiry" className="text-xs font-medium text-foreground">
          Expiry
        </label>
        <input
          id="assertion-expiry"
          name="expires_at"
          type="date"
          value={expiryDate}
          readOnly
          className="h-11 rounded-[4px] border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
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
