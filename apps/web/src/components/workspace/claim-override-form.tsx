"use client";

import { Scale } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type MutationState = { status: "idle" | "success" | "error"; message: string };
const initialState: MutationState = { status: "idle", message: "" };

export function ClaimOverrideForm({
  claimId,
  currentTier,
  canOverride,
  action,
}: {
  claimId: string;
  currentTier: "T1" | "T2" | "T3";
  canOverride: boolean;
  action: (previous: MutationState, formData: FormData) => Promise<MutationState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="mt-5 grid gap-3 border-t border-border pt-5">
      <input type="hidden" name="claim_id" value={claimId} />
      <div>
        <h3 className="text-sm font-semibold">Human evidence review</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Promote or demote this claim without changing the immutable observations. Every override
          is audited.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
        <select
          name="tier"
          defaultValue={currentTier}
          disabled={!canOverride}
          aria-label="Evidence tier override"
          className="h-10 rounded-[4px] border border-input bg-background px-3 text-sm"
        >
          <option value="automatic">Automatic tier</option>
          <option value="T1">T1 · proven echo</option>
          <option value="T2">T2 · pattern</option>
          <option value="T3">T3 · exposure</option>
        </select>
        <input
          name="reason"
          required
          minLength={3}
          maxLength={1000}
          disabled={!canOverride}
          placeholder="Review reason"
          className="h-10 rounded-[4px] border border-input bg-background px-3 text-sm"
        />
        <Button type="submit" size="sm" disabled={!canOverride || pending} className="h-10 gap-2">
          <Scale aria-hidden="true" />
          {pending ? "Saving" : "Apply"}
        </Button>
      </div>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={
            state.status === "error" ? "text-xs text-destructive" : "text-xs text-tier-proof"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
