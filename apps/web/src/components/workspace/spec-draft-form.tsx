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
          <b>{state.title}</b>
          {state.summary ? <p className="text-muted-foreground">{state.summary}</p> : null}
          {typeof state.uncertainty === "number" ? (
            <p className="text-[11px] text-muted-foreground">
              Advisory model uncertainty: {Math.round(state.uncertainty * 100)}%
            </p>
          ) : null}
          {state.patch ? (
            <pre className="max-h-64 overflow-auto rounded-lg border border-input bg-industrial-3 p-3 text-[11px] leading-6 text-foreground">
              <code>{state.patch}</code>
            </pre>
          ) : null}
          {state.citations?.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Spec draft citations">
              {state.citations.map((citation) => {
                const type = citation.resource_type ?? citation.resourceType ?? "evidence";
                const id = citation.resource_id ?? citation.resourceId ?? "unknown";
                return (
                  <li
                    key={`${type}:${id}`}
                    className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground"
                  >
                    {type.replaceAll("_", " ")} · {id.slice(0, 18)}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p>{state.message}</p>
        </div>
      ) : null}
    </form>
  );
}
