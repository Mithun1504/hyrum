"use client";

import { CalendarClock, FileCheck2, Megaphone } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";

type MutationState = { status: "idle" | "success" | "error"; message: string };

const initialState: MutationState = { status: "idle", message: "" };

export function AssertionResolutionForm({
  assertionId,
  canResolve,
  action,
}: {
  assertionId: string;
  canResolve: boolean;
  action: (previous: MutationState, formData: FormData) => Promise<MutationState>;
}) {
  const [resolution, setResolution] = useState<"documented" | "extend" | "schedule_break">(
    "documented",
  );
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-5 grid gap-3 border-t border-border pt-5">
      <input type="hidden" name="assertion_id" value={assertionId} />
      <label className="grid gap-1 text-xs font-medium">
        Resolution
        <select
          name="resolution"
          value={resolution}
          disabled={!canResolve}
          onChange={(event) => setResolution(event.target.value as typeof resolution)}
          className="h-10 rounded-[4px] border border-input bg-background px-3 text-sm"
        >
          <option value="documented">Document in OpenAPI</option>
          <option value="extend">Extend with justification</option>
          <option value="schedule_break">Schedule a deliberate break</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Justification
        <textarea
          name="reason"
          required
          minLength={3}
          maxLength={2000}
          disabled={!canResolve}
          className="min-h-20 resize-y rounded-[4px] border border-input bg-background px-3 py-2 text-sm"
          placeholder="Why this is the correct expiry outcome."
        />
      </label>
      {resolution !== "documented" ? (
        <label className="grid gap-1 text-xs font-medium">
          {resolution === "extend" ? "New expiry" : "Break date"}
          <input
            name="resolution_date"
            type="date"
            required
            disabled={!canResolve}
            className="h-10 rounded-[4px] border border-input bg-background px-3 text-sm"
          />
        </label>
      ) : null}
      <Button type="submit" size="sm" disabled={!canResolve || pending} className="w-fit gap-2">
        {resolution === "documented" ? (
          <FileCheck2 aria-hidden="true" />
        ) : resolution === "extend" ? (
          <CalendarClock aria-hidden="true" />
        ) : (
          <Megaphone aria-hidden="true" />
        )}
        {pending ? "Recording resolution" : "Record resolution"}
      </Button>
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
