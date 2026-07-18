import { ArrowRight, Filter } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProgressStream } from "@/components/workspace/progress-stream";
import { TierBadge } from "@/components/workspace/tier-badge";
import {
  EmptyPanel,
  LedgerTable,
  PageIntro,
  SelectFilter,
  StatCell,
} from "@/components/workspace/workspace-primitives";
import type { EvidenceTier, WorkspaceSnapshot } from "@/services/workspace-data";

export function CaptureView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const capture = snapshot.summary?.capture;

  return (
    <>
      <PageIntro
        title="Capture"
        desc="Confirm the trust boundary first. Hyrum only keeps redacted evidence with session order intact, so a later echo can still prove a dependency."
        actions={
          <Button asChild variant="outline">
            <Link href="/app?view=ledger" prefetch={false}>
              Review ledger
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
        <section className="min-w-0 border border-border bg-card">
          <div className="border-b border-border p-4 md:p-6">
            <h2 className="text-lg font-semibold">Capture boundary</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Traffic stays tenant-scoped. Bodies, cookies, credentials, signed URLs, and full
              prompts are redacted before evidence leaves your infrastructure.
            </p>
          </div>
          <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <BoundaryStep
              step="01"
              title="API edge"
              detail="Receives production calls and keeps the original sequence."
            />
            <BoundaryStep
              step="02"
              title="Capture agent"
              detail="Samples complete sessions and applies redaction before egress."
            />
            <BoundaryStep
              step="03"
              title="Control plane"
              detail="Stores redacted receipts, digests, and consumer-scoped facts."
            />
          </div>
          <dl className="grid gap-0 border-t border-border text-sm sm:grid-cols-2">
            <FactRow
              label="Status"
              value={snapshot.apiStatus === "ok" ? "Control plane reachable" : snapshot.apiStatus}
            />
            <FactRow
              label="Retention"
              value={
                snapshot.summary
                  ? `${snapshot.summary.organization.retention_days} days`
                  : "Unavailable"
              }
            />
            <FactRow
              label="Region"
              value={snapshot.summary ? snapshot.summary.organization.region : "Unavailable"}
            />
            <FactRow label="Data mode" value={snapshot.dataMode} />
          </dl>
        </section>
        <section className="grid min-w-0 content-start border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-semibold">Observed today</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Control-plane summary for the current tenant.
            </p>
          </div>
          <div className="grid grid-cols-2">
            <CaptureMetric
              label="Endpoints"
              value={capture ? String(capture.endpoint_count) : "—"}
            />
            <CaptureMetric
              label="Consumers"
              value={capture ? String(capture.consumer_count) : "—"}
            />
            <CaptureMetric
              label="Sessions 24h"
              value={capture ? String(capture.sessions_24h) : "—"}
            />
            <CaptureMetric
              label="Evidence 24h"
              value={capture ? String(capture.evidence_events_24h) : "—"}
            />
          </div>
        </section>
      </div>
      <ProgressStream initialEvents={snapshot.progressEvents} live={snapshot.apiStatus === "ok"} />
    </>
  );
}

function BoundaryStep({ step, title, detail }: { step: string; title: string; detail: string }) {
  return (
    <div className="p-4 md:p-6">
      <div className="font-mono text-xs text-muted-foreground">{step}</div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-4 border-b border-border px-4 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </div>
  );
}

function CaptureMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border p-4 odd:border-r [&:nth-last-child(-n+2)]:border-b-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export function LedgerView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const tierCounts = countByTier(snapshot.ledgerRows);

  return (
    <>
      <PageIntro
        title="Accidental-contract ledger"
        desc="Review the latest 100 ledger entries returned by the control plane. Counts are behavior × consumer totals; the endpoint is retained context, not a scope boundary."
      />
      <form className="mb-4 grid gap-3 border border-border bg-card p-4 md:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto]">
        <input type="hidden" name="view" value="ledger" />
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={snapshot.filters.query}
            className="h-11 rounded-[4px] border border-input bg-background px-3 text-base font-normal text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
            placeholder="endpoint, consumer, behavior"
          />
        </label>
        <SelectFilter
          name="tier"
          value={snapshot.filters.tier}
          options={["all", "T1", "T2", "T3"]}
        />
        <SelectFilter
          name="kind"
          value={snapshot.filters.kind}
          options={["all", "shape", "ordering", "error", "status"]}
        />
        <SelectFilter
          name="state"
          value={snapshot.filters.state}
          options={["all", "active", "stale", "dismissed"]}
        />
        <Button type="submit" className="self-end">
          <Filter aria-hidden="true" /> Filter
        </Button>
      </form>
      <section className="overflow-hidden border border-border bg-card">
        <div className="grid grid-cols-2 border-b border-border md:grid-cols-4">
          <StatCell label="Visible rows" value={String(snapshot.ledgerRows.length)} />
          <TierCountCell tier="T1" count={tierCounts.T1} />
          <TierCountCell tier="T2" count={tierCounts.T2} />
          <TierCountCell tier="T3" count={tierCounts.T3} />
        </div>
        {snapshot.ledgerRows.length ? (
          <>
            <div className="border-b border-border p-4 text-sm">
              <p className="text-muted-foreground">
                Open a row to inspect the contextual behavior record and its receipt sequence.
              </p>
            </div>
            <LedgerTable rows={snapshot.ledgerRows} selectedId={snapshot.selected?.id} />
          </>
        ) : (
          <EmptyPanel title="No behaviors match these filters" />
        )}
      </section>
    </>
  );
}

function TierCountCell({ tier, count }: { tier: EvidenceTier; count: number }) {
  return (
    <div className="border-b border-border p-4 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="mb-2">
        <TierBadge tier={tier} compact />
      </div>
      <div className="text-2xl font-semibold">{count}</div>
    </div>
  );
}

function countByTier(rows: WorkspaceSnapshot["ledgerRows"]): Record<EvidenceTier, number> {
  return rows.reduce(
    (counts, row) => {
      counts[row.tier] += 1;
      return counts;
    },
    { T1: 0, T2: 0, T3: 0 } satisfies Record<EvidenceTier, number>,
  );
}
