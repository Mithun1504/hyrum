"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { GatePolicy } from "@/services/workspace-data";

type MutationState = { status: "idle" | "success" | "error"; message: string };
const initialState: MutationState = { status: "idle", message: "" };

export function PolicyEditor({
  policy,
  canManage,
  action,
}: {
  policy: GatePolicy;
  canManage: boolean;
  action: (previous: MutationState, formData: FormData) => Promise<MutationState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="version" value={policy.version} />
      <div>
        <h2 className="text-base font-semibold">Edit decision mapping</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Saving creates a new immutable policy version. Only T1 evidence may block.
        </p>
      </div>
      <PolicyOutcome
        name="t1_outcome"
        label="Matched T1 outcome"
        defaultValue={
          policy.block_tiers.includes("T1")
            ? "block"
            : policy.warn_tiers.includes("T1")
              ? "warn"
              : "pass"
        }
        options={["block", "warn", "pass"]}
        disabled={!canManage}
      />
      <PolicyOutcome
        name="t2_outcome"
        label="Matched T2 outcome"
        defaultValue={policy.warn_tiers.includes("T2") ? "warn" : "pass"}
        options={["warn", "pass"]}
        disabled={!canManage}
      />
      <PolicyOutcome
        name="t3_outcome"
        label="Matched T3 outcome"
        defaultValue={policy.warn_tiers.includes("T3") ? "warn" : "pass"}
        options={["warn", "pass"]}
        disabled={!canManage}
      />
      <Button type="submit" disabled={!canManage || pending} className="w-fit gap-2">
        <Save aria-hidden="true" />
        {pending ? "Publishing policy" : "Publish new version"}
      </Button>
      {!canManage ? (
        <p className="text-xs text-muted-foreground">Owner or admin access is required.</p>
      ) : null}
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

function PolicyOutcome({
  name,
  label,
  defaultValue,
  options,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: string[];
  disabled: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-[4px] border border-border bg-background/50 px-3 text-sm">
      {label}
      <select
        name={name}
        aria-label={label}
        defaultValue={defaultValue}
        disabled={disabled}
        className="min-h-9 rounded-[4px] border border-input bg-background px-2 text-sm capitalize"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
