import { CheckCircle2, Clock, type LucideIcon, ShieldAlert } from "lucide-react";
import { pinAssertionAction, resolveAssertionAction } from "@/app/(dashboard)/app/actions";
import { AssertionPinForm } from "@/components/workspace/assertion-pin-form";
import { AssertionResolutionForm } from "@/components/workspace/assertion-resolution-form";
import { CorpusManager } from "@/components/workspace/corpus-manager";
import { SpecDraftForm } from "@/components/workspace/spec-draft-form";
import { OutcomeBadge, TierBadge } from "@/components/workspace/tier-badge";
import { EmptyPanel, PageIntro } from "@/components/workspace/workspace-primitives";
import { cn } from "@/lib/utils";
import type { Assertion, ReplayDelta, WorkspaceSnapshot } from "@/services/workspace-data";

const statusRank: Record<Assertion["status"], number> = {
  expired: 0,
  active: 1,
  resolved: 2,
};

const statusCopy = {
  active: { label: "Active", icon: Clock, className: "text-tier-pattern" },
  expired: {
    label: "Expired",
    icon: ShieldAlert,
    className: "text-destructive",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    className: "text-status-success",
  },
} satisfies Record<Assertion["status"], { label: string; icon: LucideIcon; className: string }>;

export function AssertionsView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const row = snapshot.selected;
  const matchingAssertions = row
    ? orderAssertions(
        snapshot.assertions.filter((assertion) => assertion.behavior_id === row.behavior_id),
        row.behavior_id,
      )
    : [];
  const assertions = orderAssertions(snapshot.assertions, row?.behavior_id ?? null);
  const assertion = matchingAssertions[0];

  return (
    <>
      <PageIntro
        title="Assertions"
        desc="Pinned behaviors become expiring replay tests. Keep the ones you still depend on, resolve the ones the product can safely break."
      />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="min-w-0 rounded-md border border-border bg-card p-4 md:p-6">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <AssertionDetail
              assertion={assertion}
              selectedCount={matchingAssertions.length}
              canDraft={snapshot.permissions.canPinAssertion}
              canResolve={snapshot.permissions.canPinAssertion}
            />
            <SelectedBehavior snapshot={snapshot} />
          </div>
        </section>
        <section className="min-w-0 rounded-md border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Assertion lifecycle</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Expired reviews first, then active commitments and resolved history.
            </p>
          </div>
          {assertions.length ? (
            <div className="divide-y divide-border">
              {assertions.map((item) => (
                <AssertionRow
                  key={item.id}
                  assertion={item}
                  selected={item.behavior_id === row?.behavior_id}
                />
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              No assertions have been pinned yet.
            </div>
          )}
        </section>
        <section className="min-w-0 rounded-md border border-border bg-card xl:col-span-2">
          <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <LifecycleStep
              step="01"
              title="Pin the behavior"
              desc="A selected ledger behavior starts with owner, reason, and expiry."
            />
            <LifecycleStep
              step="02"
              title="Make it official"
              desc="Draft the OpenAPI change from the assertion and its evidence."
            />
            <LifecycleStep
              step="03"
              title="Expire or resolve"
              desc="Renew only with justification; otherwise change the behavior deliberately."
            />
          </div>
        </section>
      </div>
    </>
  );
}

export function ReplayView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const report = snapshot.replayReport;

  return (
    <>
      <PageIntro
        title="Replay integrity"
        desc="One redacted corpus, one extractor, two builds. The screen shows what was replayed and why the gate reached its decision."
        actions={report ? <OutcomeBadge outcome={report.decision.outcome} /> : null}
      />
      {report ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-md border border-border bg-card">
            <div className="grid gap-4 border-b border-border p-4 md:grid-cols-[1fr_auto] md:p-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Signed run from {formatDateTime(report.generated_at)}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {report.decision.reasons.length > 0
                    ? report.decision.reasons.join(" ")
                    : "The signed report did not include reason text; its outcome and counts remain authoritative."}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-center text-xs md:min-w-64">
                <RunCount label="blocks" value={report.decision.block_count} />
                <RunCount label="warns" value={report.decision.warn_count} />
                <RunCount label="notes" value={report.decision.note_count} />
              </dl>
            </div>
            <ReplayCases report={report} />
          </section>
          <aside className="grid gap-4">
            <Provenance report={report} />
            <AssertionResults report={report} />
          </aside>
        </div>
      ) : (
        <EmptyPanel
          title="Replay run unavailable"
          description="No signed replay report has been ingested for this organization yet."
        />
      )}
      <div className="mt-4">
        <CorpusManager
          corpora={snapshot.replayCorpora}
          canManage={snapshot.permissions.canManageCorpus}
        />
      </div>
    </>
  );
}

function AssertionDetail({
  assertion,
  selectedCount,
  canDraft,
  canResolve,
}: {
  assertion: Assertion | undefined;
  selectedCount: number;
  canDraft: boolean;
  canResolve: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {assertion ? "Selected assertion" : "No assertion selected"}
        </h2>
        {assertion ? <StatusStamp status={assertion.status} /> : null}
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <Fact label="owner" value={assertion?.owner_name ?? "Not assigned"} />
        <Fact
          label="reason"
          value={assertion?.reason ?? "Select a ledger behavior, then pin it."}
        />
        {assertion?.resolution_reason ? (
          <Fact label="resolution" value={assertion.resolution_reason} />
        ) : null}
        <Fact label="enforcement" value={assertion ? "Replay test on every CI run" : "None"} />
        <Fact label="expires" value={assertion ? formatDate(assertion.expires_at) : "—"} />
      </dl>
      {selectedCount > 1 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {selectedCount} assertions match the selected behavior. The newest active item is shown
          first.
        </p>
      ) : null}
      {assertion ? <SpecDraftForm assertionId={assertion.id} canDraft={canDraft} /> : null}
      {assertion && assertion.status !== "resolved" ? (
        <AssertionResolutionForm
          assertionId={assertion.id}
          canResolve={canResolve}
          action={resolveAssertionAction}
        />
      ) : null}
      {assertion?.customer_notice ? (
        <div className="mt-5 rounded-[4px] border border-tier-pattern/40 bg-tier-pattern/10 p-3 text-xs">
          <div className="font-semibold">{assertion.customer_notice.subject}</div>
          <p className="mt-1 text-muted-foreground">{assertion.customer_notice.summary}</p>
          <p className="mt-3 whitespace-pre-wrap text-foreground">
            {assertion.customer_notice.body}
          </p>
          <div className="mt-3 border-t border-tier-pattern/25 pt-3">
            <div className="font-semibold">
              Consumer impact ({assertion.customer_notice.impacted_consumers.length})
            </div>
            {assertion.customer_notice.impacted_consumers.length ? (
              <ul className="mt-2 grid gap-2">
                {assertion.customer_notice.impacted_consumers.map((consumer) => (
                  <li key={consumer.consumer_id} className="rounded-[4px] border border-border p-2">
                    <span className="font-medium">{consumer.display_alias}</span>
                    <span className="ml-2 font-mono text-muted-foreground">{consumer.tier}</span>
                    <div className="mt-1 text-muted-foreground">
                      {consumer.endpoints.join(", ") || "Endpoint unavailable"}
                      {consumer.observation_count === null
                        ? ""
                        : ` · ${consumer.observation_count} observations`}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">
                No receipt-backed consumers are currently affected.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SelectedBehavior({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const row = snapshot.selected;

  if (!row) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
        Pick a behavior in the ledger before creating a new assertion.
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={row.tier} compact />
          <span className="text-xs text-muted-foreground">{row.endpoint}</span>
        </div>
        <h3 className="mt-3 text-sm font-semibold">{row.title}</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {row.observation_count} observations across {row.session_count} sessions ·{" "}
          {row.receipt_id ? "receipt attached" : "no active receipt"}
        </p>
      </div>
      <AssertionPinForm
        behaviorId={row.behavior_id}
        claimId={row.claim_id}
        canPin={snapshot.permissions.canPinAssertion}
        permissionReason={snapshot.permissions.reason}
        defaultExpiry={snapshot.defaultAssertionExpiry}
        pinAction={pinAssertionAction}
      />
    </div>
  );
}

function AssertionRow({ assertion, selected }: { assertion: Assertion; selected: boolean }) {
  return (
    <article className={cn("grid gap-3 p-4", selected && "bg-secondary")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{assertion.owner_name}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{assertion.reason}</p>
        </div>
        <StatusStamp status={assertion.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Fact label="expires" value={formatDate(assertion.expires_at)} />
        <Fact label="behavior" value={assertion.behavior_title} />
      </dl>
    </article>
  );
}

function ReplayCases({ report }: { report: NonNullable<WorkspaceSnapshot["replayReport"]> }) {
  return (
    <div className="divide-y divide-border">
      {report.results.map((result) => (
        <article key={result.case_id} className="grid gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{result.case_id}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.deltas.length} delta
                {result.deltas.length === 1 ? "" : "s"} found
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <RunStamp good={result.stable} label={result.stable ? "stable" : "unstable"} />
              <RunStamp
                good={!result.quarantined}
                label={result.quarantined ? "quarantined" : "eligible"}
              />
            </div>
          </div>
          {result.deltas.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-3 pr-4 font-semibold">Change</th>
                    <th className="py-3 pr-4 font-semibold">Before</th>
                    <th className="py-3 pr-4 font-semibold">After</th>
                    <th className="py-3 font-semibold">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {result.deltas.map((delta) => (
                    <DeltaRow key={delta.digest} delta={delta} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No behavioral delta in this case.</p>
          )}
        </article>
      ))}
    </div>
  );
}

function DeltaRow({ delta }: { delta: ReplayDelta }) {
  return (
    <tr className="border-b border-border/70 last:border-b-0">
      <td className="py-3 pr-4 align-top">
        <div className="font-semibold">{delta.kind}</div>
        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{delta.path}</div>
      </td>
      <td className="py-3 pr-4 align-top">
        <ValueBlock value={delta.before} />
      </td>
      <td className="py-3 pr-4 align-top">
        <ValueBlock value={delta.after} />
      </td>
      <td className="py-3 align-top">
        {delta.matches.length ? (
          <div className="flex flex-wrap gap-2">
            {delta.matches.map((match) => (
              <span key={`${delta.digest}:${match.claim_id}`}>
                {match.tier ? (
                  <TierBadge tier={match.tier} compact />
                ) : (
                  <span
                    className="inline-flex min-h-6 items-center rounded-sm border border-border px-2 font-mono text-[11px] text-muted-foreground"
                    title={match.claim_id}
                  >
                    tier outside loaded window
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">unclassified</span>
        )}
      </td>
    </tr>
  );
}

function Provenance({ report }: { report: NonNullable<WorkspaceSnapshot["replayReport"]> }) {
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Deterministic provenance</h2>
      <dl className="mt-4 grid gap-3 text-xs">
        <Fact label="base URL" value={report.base_url} mono />
        <Fact label="candidate URL" value={report.candidate_url} mono />
        <Fact label="base image" value={report.base_image_digest} mono />
        <Fact label="candidate image" value={report.candidate_image_digest} mono />
        <Fact label="corpus" value={report.corpus_digest} mono />
        <Fact label="fixture" value={report.fixture_digest} mono />
        <Fact label="mask" value={report.mask_digest} mono />
        <Fact label="extractor" value={report.extractor_version} />
        <Fact label="runner" value={report.runner_version} />
        <Fact
          label="policy"
          value={`${shortId(report.policy_id)} · v${report.policy_version}`}
          mono
        />
        {report.id ? <Fact label="replay run" value={report.id} mono /> : null}
        <Fact label="runs" value={report.runs == null ? "not reported" : String(report.runs)} />
      </dl>
    </section>
  );
}

function AssertionResults({ report }: { report: NonNullable<WorkspaceSnapshot["replayReport"]> }) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="p-4">
        <h2 className="text-sm font-semibold">Assertion results</h2>
      </div>
      {report.assertion_results.length ? (
        <ul className="divide-y divide-border border-t text-xs">
          {report.assertion_results.map((result) => (
            <li key={`${result.assertion_id}:${result.case_id}`} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{result.case_id}</span>
                <RunStamp good={result.outcome === "pass"} label={result.outcome} />
              </div>
              <div className="mt-2 font-mono text-xs text-muted-foreground">
                assertion {shortId(result.assertion_id)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t px-4 py-4 text-sm leading-6 text-muted-foreground">
          This replay run did not include assertion checks.
        </p>
      )}
    </section>
  );
}

function LifecycleStep({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="p-4 md:p-6">
      <div className="font-mono text-xs text-muted-foreground">{step}</div>
      <h3 className="mt-2 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p>
    </div>
  );
}

function StatusStamp({ status }: { status: Assertion["status"] }) {
  const copy = statusCopy[status];
  const Icon = copy.icon;

  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-semibold", copy.className)}>
      <Icon className="size-4" aria-hidden="true" />
      {copy.label}
    </span>
  );
}

function RunStamp({ label, good }: { label: string; good: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2 py-1 font-semibold",
        good
          ? "border-status-success/40 text-status-success"
          : "border-tier-pattern/50 text-tier-pattern",
      )}
    >
      <span className={cn("size-2 rounded-sm", good ? "bg-status-success" : "bg-tier-pattern")} />
      {label}
    </span>
  );
}

function RunCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn("mt-1 text-foreground", mono ? "break-all font-mono text-xs" : "break-words")}
      >
        {value}
      </dd>
    </div>
  );
}

function ValueBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-w-80 whitespace-pre-wrap break-words rounded-md border border-border bg-background/45 p-3 font-mono text-xs leading-5 text-foreground">
      {formatValue(value)}
    </pre>
  );
}

function orderAssertions(assertions: Assertion[], selectedBehaviorId: string | null) {
  return [...assertions].sort((a, b) => {
    const aSelected = selectedBehaviorId != null && a.behavior_id === selectedBehaviorId ? 0 : 1;
    const bSelected = selectedBehaviorId != null && b.behavior_id === selectedBehaviorId ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    const rank = statusRank[a.status] - statusRank[b.status];
    if (rank !== 0) return rank;
    return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatValue(value: unknown) {
  if (value == null) return "not present";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function shortId(value: string) {
  return value.slice(0, 8);
}
