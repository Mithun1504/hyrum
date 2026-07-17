import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutcomeBadge, TierBadge, TierLegend } from "@/components/workspace/tier-badge";
import { CodeBlock, EmptyPanel, PageIntro } from "@/components/workspace/workspace-primitives";
import type {
  EvidenceTier,
  LedgerRow,
  ReplayDelta,
  WorkspaceSnapshot,
} from "@/services/workspace-data";

export function BehaviorView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const row = snapshot.selected;
  if (!row) return <EmptyPanel title="No behavior selected" />;
  const demoMode = snapshot.dataMode === "demo";

  return (
    <>
      <PageIntro
        title={`${row.title} · ${row.endpoint}`}
        desc="Redacted receipt sequence and consumer impact. T1 is the only tier that can block."
        actions={<TierBadge tier={row.tier} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-6">
          <ReceiptEvidence receipt={snapshot.receipt} row={row} />
          <p className="mt-4 text-xs text-muted-foreground">{row.evidence_summary}</p>
        </section>
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 font-sans text-sm font-bold">Impact by consumer</h2>
          <div className="divide-y divide-border">
            {snapshot.consumers.map((consumer) => (
              <div
                key={consumer.id}
                className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
              >
                <span>{consumer.display_alias}</span>
                <span className="text-xs text-muted-foreground">
                  {demoMode
                    ? consumer.id === row.consumer_id
                      ? "8,732 echoes · 4,210 sessions"
                      : "receives field · no reliance signal"
                    : consumer.id === row.consumer_id
                      ? "linked to this ledger entry"
                      : "no evidence on this behavior"}
                </span>
                <Badge
                  variant={
                    consumer.id === row.consumer_id && row.tier === "T1" ? "destructive" : "outline"
                  }
                >
                  {consumer.id === row.consumer_id
                    ? row.tier === "T1"
                      ? "T1 DEPENDENCY"
                      : row.tier === "T2"
                        ? "WARN"
                        : "EXPOSURE"
                    : "NO EVIDENCE"}
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            GPT 5.6 proposes tier classifications with cited samples; deterministic definitions
            decide.
          </p>
        </section>
      </div>
      <div className="mt-6">
        <TierLegend />
      </div>
    </>
  );
}

function ReceiptEvidence({
  receipt,
  row,
}: {
  receipt: WorkspaceSnapshot["receipt"];
  row: LedgerRow;
}) {
  if (!receipt) {
    return (
      <EmptyPanel
        title="No receipt is attached"
        description="This behavior has no redacted receipt available for inspection."
      />
    );
  }

  return (
    <>
      <h2 className="mb-4 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Receipt · {receipt.digest}
      </h2>
      {receipt.object_key === null ? (
        <p className="mb-4 border border-tier-pattern/50 bg-tier-pattern/10 px-3 py-2 text-[11px] text-tier-pattern">
          Receipt metadata remains available, but the durable receipt bundle is unavailable.
        </p>
      ) : null}
      <dl className="grid gap-2 text-xs sm:grid-cols-[112px_1fr]">
        <dt className="text-muted-foreground">sequence</dt>
        <dd>
          {receipt.sequence_start}–{receipt.sequence_end}
        </dd>
        <dt className="text-muted-foreground">redaction</dt>
        <dd>{receipt.redaction_version}</dd>
        <dt className="text-muted-foreground">expires</dt>
        <dd>{new Date(receipt.expires_at).toLocaleString("en-US")}</dd>
      </dl>
      <CodeBlock label="Redacted excerpt" code={formatExcerpt(receipt.excerpt)} />
      {row?.tier === "T1" ? (
        <p className="mt-3 text-[11px] text-tier-proof">
          T1 proof: the same keyed hash appears in a response and a later request from this consumer
          session.
        </p>
      ) : null}
    </>
  );
}

function formatExcerpt(excerpt: unknown) {
  if (typeof excerpt === "string") return excerpt;
  return JSON.stringify(excerpt, null, 2) ?? "Receipt excerpt is empty.";
}

export function GateView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const report = snapshot.replayReport;
  const metrics = snapshot.metrics;
  return (
    <>
      <PageIntro
        title="Change gate"
        desc="Differential replay measures base and candidate builds against the same redacted corpus. The LLM only explains; it never decides whether behavior changed."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app?view=replay">Full replay report</Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={
                  snapshot.selected
                    ? `/app?view=behavior&entry=${encodeURIComponent(snapshot.selected.id)}`
                    : "/app?view=behavior"
                }
              >
                Inspect receipt
              </Link>
            </Button>
          </>
        }
      />
      {!report ? (
        <EmptyPanel
          title="No replay report is available"
          description="No signed replay report has been ingested for this organization yet."
        />
      ) : (
        <section className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-4 border-b border-border p-4">
            <span className="rounded-lg border border-destructive/50 bg-destructive/20 px-4 py-3 font-sans text-sm font-extrabold uppercase tracking-[0.08em] text-destructive">
              Gate: {report.decision.outcome}
            </span>
            <p className="text-xs text-muted-foreground">
              {snapshot.dataMode === "demo" ? (
                <>
                  PR <b className="text-foreground">#8427</b> · replay{" "}
                  <b className="text-foreground">512 sessions</b> in 04:08 ·{" "}
                </>
              ) : (
                <>
                  generated{" "}
                  <b className="text-foreground">
                    {new Date(report.generated_at).toLocaleString("en-US")}
                  </b>{" "}
                  · {report.runs === null ? "run count not reported" : `${report.runs} runs`} ·{" "}
                </>
              )}
              determinism{" "}
              <b className="text-foreground">
                {metrics ? `${(metrics.stability * 100).toFixed(1)}%` : "not reported"}
              </b>
            </p>
            <OutcomeBadge outcome={report.decision.outcome} />
          </div>
          <div className="divide-y divide-border">
            {report.results.map((result) => (
              <div key={result.case_id} className="p-4">
                {result.deltas.map((delta) => (
                  <GateDeltaRow key={delta.digest} delta={delta} snapshot={snapshot} />
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4 text-xs text-muted-foreground">
            {snapshot.dataMode === "demo"
              ? "Not flagged: legacy_id is T3 exposure only and shows no behavioral delta in this replay."
              : `${report.decision.block_count} blocking, ${report.decision.warn_count} warning, and ${report.decision.note_count} informational findings.`}
          </div>
        </section>
      )}
    </>
  );
}

function GateDeltaRow({ delta, snapshot }: { delta: ReplayDelta; snapshot: WorkspaceSnapshot }) {
  const match = delta.matches[0];
  const tier = match?.tier;
  const matchedRow = match
    ? snapshot.allLedgerRows.find((row) => row.claim_id === match.claim_id)
    : null;
  const matchedImpact = matchedRow?.impact ?? null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {tier ? (
          <TierBadge tier={tier} compact />
        ) : (
          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
            NOTE
          </Badge>
        )}
        <span>
          {delta.path} · {delta.kind} delta
        </span>
        <Badge
          className={gateDecisionClassName(tier)}
          variant={tier === "T1" ? "destructive" : "outline"}
        >
          {gateDecisionLabel(tier)}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CodeBlock label="base" code={JSON.stringify(delta.before)} compact />
        <CodeBlock label="candidate" code={JSON.stringify(delta.after)} compact />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          <b className="text-foreground">Receipt:</b> {matchedImpact ?? gateReceiptFallback(tier)}
        </span>
        {matchedRow ? (
          <Link
            href={`/app?view=behavior&entry=${encodeURIComponent(matchedRow.id)}`}
            prefetch={false}
            className="min-h-8 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors duration-150 ease-out hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Open matched evidence
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function gateDecisionLabel(tier: EvidenceTier | undefined) {
  if (tier === "T1") return "BLOCK";
  if (tier === "T2") return "WARN";
  if (tier === "T3") return "EXPOSURE";
  return "NOTE";
}

function gateDecisionClassName(tier: EvidenceTier | undefined) {
  if (tier === "T2") return "ml-auto border-tier-pattern/40 text-tier-pattern";
  if (tier === "T3") return "ml-auto border-tier-exposure/40 text-tier-exposure";
  if (!tier) return "ml-auto border-muted-foreground/30 text-muted-foreground";
  return "ml-auto";
}

function gateReceiptFallback(tier: EvidenceTier | undefined) {
  if (tier === "T1") return "T1 echo evidence matched this replay delta.";
  if (tier === "T2") return "T2 pattern evidence matched this replay delta; warn only.";
  if (tier === "T3") return "T3 exposure matched this replay delta; never a dependency or block.";
  return "No ledger claim matched this replay delta; classify it before treating it as evidence.";
}
