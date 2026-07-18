"use client";

import { FileText } from "lucide-react";
import { useActionState } from "react";
import { draftSpecAction, type SpecDraftState } from "@/app/(dashboard)/app/actions";
import { Button } from "@/components/ui/button";

const initialState: SpecDraftState = { status: "idle", message: "" };

export function SpecDraftForm({
  assertionId,
  canDraft,
}: {
  assertionId: string;
  canDraft: boolean;
}) {
  const [state, action, pending] = useActionState(draftSpecAction, initialState);

  return (
    <form action={action} className="mt-4 border-t border-border pt-4">
      <input type="hidden" name="assertion_id" value={assertionId} />
      <Button type="submit" variant="outline" disabled={!canDraft || pending} className="gap-2">
        <FileText aria-hidden="true" />
        {pending ? "Drafting spec change" : "Draft OpenAPI change"}
      </Button>
      {state.status !== "idle" ? (
        <div
          className={
            state.status === "error"
              ? "mt-3 text-xs text-destructive"
              : "mt-3 grid gap-3 text-xs text-tier-proof"
          }
          role="status"
        >
          {state.draft ? <SpecDraftResult state={state} /> : null}
          <p>{state.message}</p>
        </div>
      ) : null}
    </form>
  );
}

function SpecDraftResult({ state }: { state: SpecDraftState }) {
  const draft = state.draft;
  if (!draft) return null;

  return (
    <div className="grid gap-4 text-foreground">
      <div>
        <h3 className="text-sm font-semibold">{draft.title}</h3>
        <p className="mt-1 leading-5 text-muted-foreground">
          {draft.abstained
            ? (draft.abstentionReason ?? "The draft abstained because evidence was insufficient.")
            : draft.summary}
        </p>
      </div>
      <div>
        <h4 className="text-xs font-medium text-muted-foreground">Rationale</h4>
        <p className="mt-1 leading-5">{draft.rationale}</p>
      </div>
      {draft.openapiPatch.length > 0 ? (
        <div className="overflow-hidden rounded-[4px] border">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
            Proposed OpenAPI operations
          </div>
          <div className="divide-y divide-border">
            {draft.openapiPatch.map((operation) => (
              <div
                key={`${operation.op}:${operation.path}`}
                className="grid gap-1 px-3 py-3 sm:grid-cols-[4rem_minmax(0,1fr)]"
              >
                <code className="text-[11px] text-tier-exposure">{operation.op}</code>
                <div className="min-w-0">
                  <code className="break-all text-[11px]">{operation.path}</code>
                  <p className="mt-1 text-muted-foreground">
                    {operation.value.type}
                    {operation.value.format ? ` · ${operation.value.format}` : ""}
                    {operation.value.description ? ` · ${operation.value.description}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <dl className="grid gap-2 border-t pt-3 text-[11px] text-muted-foreground sm:grid-cols-2">
        <DraftFact label="evidence receipts" value={draft.receiptIds.join(", ")} mono />
        <DraftFact label="uncertainty" value={`${Math.round(draft.uncertainty * 100)}%`} />
        <DraftFact label="source" value={state.source ?? "not reported"} />
        <DraftFact label="model" value={state.model ?? "not reported"} mono />
        <DraftFact label="prompt" value={state.promptVersion ?? "not reported"} mono />
        <DraftFact label="response" value={state.responseId ?? "fallback"} mono />
      </dl>
    </div>
  );
}

function DraftFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt>{label}</dt>
      <dd
        className={mono ? "mt-0.5 break-all font-mono text-foreground" : "mt-0.5 text-foreground"}
      >
        {value}
      </dd>
    </div>
  );
}
