import { Archive, FileText, RefreshCcw } from "lucide-react";
import { pinAssertionAction } from "@/app/(dashboard)/app/actions";
import { AssertionPinForm } from "@/components/workspace/assertion-pin-form";
import { SpecDraftForm } from "@/components/workspace/spec-draft-form";
import {
  CodeBlock,
  EmptyPanel,
  LedgerTable,
  MetricCell,
  PageIntro,
  StatCell,
} from "@/components/workspace/workspace-primitives";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

export function AssertionsView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const row = snapshot.selected;
  const selectedAssertions = row
    ? snapshot.assertions.filter((assertion) => assertion.behavior_id === row.behavior_id)
    : [];
  const assertion = selectedAssertions[0] ?? snapshot.assertions[0];
  return (
    <>
      <PageIntro
        title="Assertions"
        desc="Living replay tests with mandatory expiry. Accidents do not become permanent silently."
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-sans text-sm font-bold">
            {row ? "Assertion for selected behavior" : "Active assertion"}
          </h2>
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-[96px_1fr]">
            <dt className="text-muted-foreground">owner</dt>
            <dd>{assertion?.owner_id ?? "No active assertion"}</dd>
            <dt className="text-muted-foreground">reason</dt>
            <dd>{assertion?.reason ?? "Pin a ledger behavior to create one."}</dd>
            <dt className="text-muted-foreground">enforcement</dt>
            <dd>replay test on every CI run</dd>
            <dt className="text-muted-foreground">expires</dt>
            <dd className="text-tier-pattern">
              {assertion ? new Date(assertion.expires_at).toLocaleDateString("en-US") : "—"}
            </dd>
          </dl>
          {selectedAssertions.length > 1 ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {selectedAssertions.length} assertions match this selected behavior.
            </p>
          ) : null}
          {assertion ? (
            <SpecDraftForm
              assertionId={assertion.id}
              canDraft={snapshot.permissions.canPinAssertion}
            />
          ) : null}
          {row ? (
            <div className="mt-6">
              <AssertionPinForm
                behaviorId={row.behavior_id}
                claimId={row.claim_id}
                canPin={snapshot.permissions.canPinAssertion}
                permissionReason={snapshot.permissions.reason}
                defaultExpiry={snapshot.defaultAssertionExpiry}
                pinAction={pinAssertionAction}
              />
            </div>
          ) : null}
        </section>
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-sans text-sm font-bold">All assertions</h2>
            <p className="text-[11px] text-muted-foreground">
              Every pinned contract stays visible; the selected behavior is highlighted.
            </p>
          </div>
          <div className="divide-y divide-border">
            {snapshot.assertions.map((item) => (
              <div
                key={item.id}
                className={item.behavior_id === row?.behavior_id ? "bg-tier-proof/10 p-4" : "p-4"}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-sm">{item.owner_id}</b>
                  <span className="text-[11px] text-muted-foreground">{item.status}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.reason}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card">
          <LifecycleItem
            icon={FileText}
            title="Document"
            desc="Draft the OpenAPI PR that makes the behavior official."
          />
          <LifecycleItem
            icon={RefreshCcw}
            title="Extend with justification"
            desc="Owner and reason required; logged to assertion history."
          />
          <LifecycleItem
            icon={Archive}
            title="Deliberately break"
            desc="Draft per-consumer notice with impact and dates."
          />
        </section>
      </div>
    </>
  );
}

export function ReplayView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const metrics = snapshot.metrics;
  const report = snapshot.replayReport;
  return (
    <>
      <PageIntro
        title="Replay health & coverage"
        desc="Precision and recall are measured together. A quiet gate that misses dependencies is a failed gate."
      />
      {!metrics ? (
        report ? (
          <section className="rounded-xl border border-border bg-card">
            <div className="grid grid-cols-2 border-b border-border md:grid-cols-4">
              <StatCell label="Latest outcome" value={report.decision.outcome.toUpperCase()} />
              <StatCell
                label="Deltas"
                value={String(
                  report.results.reduce((total, result) => total + result.deltas.length, 0),
                )}
              />
              <StatCell label="Blocking" value={String(report.decision.block_count)} />
              <StatCell label="Warnings" value={String(report.decision.warn_count)} />
            </div>
            <div className="p-4 text-xs text-muted-foreground">
              Latest signed run: {new Date(report.generated_at).toLocaleString("en-US")} ·{" "}
              {report.extractor_version}
            </div>
            <ReplayDetail report={report} />
          </section>
        ) : (
          <EmptyPanel
            title="Replay metrics are not available"
            description="No signed replay run has been ingested for this organization yet."
          />
        )
      ) : (
        <section className="rounded-xl border border-border bg-card">
          <div className="grid grid-cols-2 border-b border-border md:grid-cols-4">
            <MetricCell label="Determinism" value={metrics.stability} />
            <MetricCell label="T1 precision" value={metrics.precision} />
            <MetricCell label="T1 recall" value={metrics.recall} warn />
            <StatCell label="Labeled cases" value={String(metrics.labeledCases)} />
          </div>
          <LedgerTable rows={snapshot.ledgerRows} compact selectedId={snapshot.selected?.id} />
          {report ? <ReplayDetail report={report} /> : null}
          <div className="border-t border-border p-4 text-xs text-muted-foreground">
            Quarantined diffs warn and cannot block until stable. Metrics exclude quarantined
            endpoints and say so.
          </div>
        </section>
      )}
    </>
  );
}

function ReplayDetail({ report }: { report: NonNullable<WorkspaceSnapshot["replayReport"]> }) {
  return (
    <div className="border-t border-border p-4">
      <h2 className="font-sans text-sm font-bold">Replay provenance</h2>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[132px_1fr]">
        <dt className="text-muted-foreground">base image</dt>
        <dd className="break-all">{report.base_image_digest}</dd>
        <dt className="text-muted-foreground">candidate image</dt>
        <dd className="break-all">{report.candidate_image_digest}</dd>
        <dt className="text-muted-foreground">corpus</dt>
        <dd className="break-all">{report.corpus_digest}</dd>
        <dt className="text-muted-foreground">extractor</dt>
        <dd>{report.extractor_version}</dd>
      </dl>
      <div className="mt-4 grid gap-3">
        {report.results.map((result) => (
          <div key={result.case_id} className="rounded-lg border border-border bg-industrial-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <b>{result.case_id}</b>
              <span className="text-muted-foreground">
                {result.stable ? "stable" : "unstable"} ·{" "}
                {result.quarantined ? "quarantined" : "eligible"}
              </span>
            </div>
            {result.deltas.map((delta) => (
              <CodeBlock
                key={delta.digest}
                label={`${delta.kind} · ${delta.path}`}
                compact
                code={JSON.stringify(
                  { before: delta.before, after: delta.after, matches: delta.matches },
                  null,
                  2,
                )}
              />
            ))}
          </div>
        ))}
      </div>
      {report.assertion_results.length ? (
        <div className="mt-4">
          <h3 className="font-sans text-sm font-bold">Assertion replay results</h3>
          <ul className="mt-2 grid gap-2 text-xs">
            {report.assertion_results.map((result) => (
              <li
                key={`${result.assertion_id}:${result.case_id}`}
                className="rounded-lg border border-border px-3 py-2"
              >
                {result.case_id} · {result.outcome} · assertion {result.assertion_id.slice(0, 8)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LifecycleItem({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof FileText;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3 border-b border-border p-4 last:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-tier-proof">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <b className="font-sans text-sm">{title}</b>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
