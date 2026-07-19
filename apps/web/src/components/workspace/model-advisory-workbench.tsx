"use client";

import { BrainCircuit, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { type ModelAdvisoryState, runModelAdvisoryAction } from "@/app/(dashboard)/app/actions";
import { Button } from "@/components/ui/button";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

type AdvisoryRole =
  | "behavior_clusters"
  | "tier_proposals"
  | "replay_priorities"
  | "impact_explanations";

const initialState: ModelAdvisoryState = { status: "idle", message: "" };
const descriptions: Record<AdvisoryRole, string> = {
  behavior_clusters: "Cluster and name observed behaviors without changing fingerprint identity.",
  tier_proposals: "Propose evidence tiers; deterministic echo eligibility still controls T1.",
  replay_priorities: "Rank curated replay cases as a cheap prefilter; no case is removed.",
  impact_explanations: "Explain consumer impact using only cited redacted receipts.",
};

export function ModelAdvisoryWorkbench({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const [role, setRole] = useState<AdvisoryRole>("behavior_clusters");
  const [state, action, pending] = useActionState(runModelAdvisoryAction, initialState);
  const entityIds = idsForRole(snapshot, role).slice(0, 100);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="size-4" aria-hidden="true" /> GPT-5.6 advisory workbench
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Advisory output is schema-validated, receipt-cited, stored without provider retention,
            and can never create a behavior fact or decide a gate.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-status-success">
          <ShieldCheck className="size-3" aria-hidden="true" /> deterministic boundary
        </span>
      </div>
      <form action={action} className="grid gap-4 p-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <label className="grid gap-1.5 text-xs font-medium">
            Advisory role
            <select
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as AdvisoryRole)}
              className="min-h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="behavior_clusters">Behavior clustering &amp; naming</option>
              <option value="tier_proposals">Evidence-tier proposals</option>
              <option value="replay_priorities">Replay prioritization</option>
              <option value="impact_explanations">Consumer-impact explanations</option>
            </select>
          </label>
          <input type="hidden" name="entity_ids" value={JSON.stringify(entityIds)} />
          <p className="text-xs leading-5 text-muted-foreground">{descriptions[role]}</p>
          <p className="text-xs text-muted-foreground">
            {entityIds.length} eligible live entit
            {entityIds.length === 1 ? "y" : "ies"}
          </p>
          <Button type="submit" disabled={pending || entityIds.length === 0} className="w-fit">
            <BrainCircuit aria-hidden="true" /> {pending ? "Generating advisory" : "Run advisory"}
          </Button>
          {state.status !== "idle" ? (
            <p
              role="status"
              className={
                state.status === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-status-success"
              }
            >
              {state.message}
            </p>
          ) : null}
        </div>
        <AdvisoryResult state={state} />
      </form>
    </section>
  );
}

function idsForRole(snapshot: WorkspaceSnapshot, role: AdvisoryRole) {
  if (role === "behavior_clusters") {
    return [
      ...new Set(
        snapshot.allLedgerRows.filter((row) => row.receipt_id).map((row) => row.behavior_id),
      ),
    ];
  }
  if (role === "replay_priorities") {
    return snapshot.replayCorpora
      .filter((corpus) => corpus.curation_status !== "archived")
      .flatMap((corpus) => corpus.items.filter((item) => item.enabled).map((item) => item.id));
  }
  return [
    ...new Set(snapshot.allLedgerRows.filter((row) => row.receipt_id).map((row) => row.claim_id)),
  ];
}

function AdvisoryResult({ state }: { state: ModelAdvisoryState }) {
  if (!state.result) {
    return (
      <div className="grid min-h-44 place-items-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Choose a role to generate a reviewable advisory result from current live evidence.
      </div>
    );
  }
  const summary =
    typeof state.result.summary === "string" ? state.result.summary : "Advisory completed.";
  const uncertainty =
    typeof state.result.uncertainty === "number" ? state.result.uncertainty : null;
  const details = detailItems(state.result);
  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Advisory result</h3>
        {uncertainty === null ? null : (
          <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
            {Math.round(uncertainty * 100)}% uncertainty
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6">{summary}</p>
      <ul className="mt-4 grid gap-2">
        {details.map((item) => (
          <li key={item.key} className="rounded-md border bg-background p-3">
            <div className="text-xs font-semibold">{item.title}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function detailItems(result: Record<string, unknown>) {
  const collection = ["clusters", "proposals", "priorities", "explanations"]
    .map((key) => result[key])
    .find(Array.isArray) as Array<Record<string, unknown>> | undefined;
  return (collection ?? []).map((item) => ({
    key: JSON.stringify(item),
    title: String(item.name ?? item.claimId ?? item.caseId ?? item.consumerId ?? "Advisory item"),
    body: String(
      item.description ??
        item.rationale ??
        item.reason ??
        item.impact ??
        "Review the cited evidence before acting.",
    ),
  }));
}
