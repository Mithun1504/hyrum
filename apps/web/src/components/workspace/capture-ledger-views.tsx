import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressStream } from "@/components/workspace/progress-stream";
import {
  CodeBlock,
  EmptyPanel,
  LedgerTable,
  PageIntro,
  SelectFilter,
  StatCard,
  StatCell,
} from "@/components/workspace/workspace-primitives";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

export function CaptureView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const liveMetrics = snapshot.dataMode === "live";
  const endpointCount = new Set(snapshot.ledgerRows.map((row) => row.operation_id).filter(Boolean))
    .size;

  return (
    <>
      <PageIntro
        title="Capture"
        desc="Session-correlated sampling keeps whole consumer-sessions: the follow-up call that proves an echo must survive the sample. Payload values never leave your VPC."
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="min-w-0 rounded-xl border border-border bg-card p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            {(liveMetrics
              ? [
                  "Gateway|your API edge",
                  "Capture agent|self-hosted · redacts",
                  "Control plane|redacted evidence only",
                ]
              : [
                  "Gateway|Envoy filter · prod",
                  "Capture agent|self-hosted · redacts",
                  "Control plane|shapes + templates only",
                ]
            ).map((stage, index) => {
              const [label, detail] = stage.split("|");
              return (
                <div className="contents" key={stage}>
                  <div className="min-w-0 rounded-lg border border-border bg-secondary px-4 py-3 text-center">
                    <b className="font-sans text-xs">{label}</b>
                    <p className="text-[10px] text-muted-foreground">{detail}</p>
                  </div>
                  {index < 2 ? (
                    <ArrowRight
                      className="hidden size-4 text-muted-foreground md:block"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {liveMetrics ? (
            <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-[96px_1fr]">
              <dt className="text-muted-foreground">correlation</dt>
              <dd>consumer session identifiers from your capture agent</dd>
              <dt className="text-muted-foreground">redaction</dt>
              <dd>applied inside your infrastructure before egress</dd>
              <dt className="text-muted-foreground">retention</dt>
              <dd>receipt-specific expiry enforced by the control plane</dd>
              <dt className="text-muted-foreground">status</dt>
              <dd>{snapshot.apiStatus === "ok" ? "ready for capture" : snapshot.apiStatus}</dd>
            </dl>
          ) : (
            <>
              <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-[96px_1fr]">
                <dt className="text-muted-foreground">correlation</dt>
                <dd>trace_id + auth.sub → consumer-session</dd>
                <dt className="text-muted-foreground">sample rate</dt>
                <dd>5% of sessions · low-volume consumers boosted ×4</dd>
                <dt className="text-muted-foreground">window</dt>
                <dd>15 min · min 3 requests/session</dd>
                <dt className="text-muted-foreground">freshness</dt>
                <dd>behaviors unobserved 90d → stale, downgraded</dd>
              </dl>
              <CodeBlock
                label="Example redaction preview"
                code={`{"email":"a•••••@•••.com","card":"•••• •••• •••• 4242","token":"h_9f••••••••"}`}
              />
            </>
          )}
        </section>
        <section className="grid min-w-0 grid-cols-2 gap-3 content-start">
          <StatCard
            label="Endpoints"
            value={liveMetrics ? String(endpointCount) : "312"}
            delta={liveMetrics ? "observed in ledger" : "▲ 6% / 7d"}
          />
          <StatCard
            label="Consumers"
            value={String(snapshot.consumers.length)}
            delta={liveMetrics ? "tenant-scoped" : "▲ 4% / 7d"}
          />
          <StatCard
            label="Sessions / 24h"
            value={liveMetrics ? "—" : "41.2k"}
            delta={liveMetrics ? "not exposed by API" : "▲ 14%"}
          />
          <StatCard
            label="Events / 24h"
            value={liveMetrics ? "—" : "1.2M"}
            delta={liveMetrics ? "not exposed by API" : "▼ 11%"}
            down={!liveMetrics}
          />
        </section>
      </div>
      <ProgressStream initialEvents={snapshot.progressEvents} live={snapshot.dataMode === "live"} />
    </>
  );
}

export function LedgerView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <>
      <PageIntro
        title="Accidental-contract ledger"
        desc="Undeclared behaviors only. Receiving a behavior is not the same as depending on it."
      />
      <form className="mb-4 grid gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <input type="hidden" name="view" value="ledger" />
        <label className="grid gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={snapshot.filters.query}
            className="h-11 rounded-md border border-input bg-background px-3 text-xs normal-case tracking-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
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
          Filter
        </Button>
      </form>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-2 border-b border-border md:grid-cols-4">
          <StatCell label="Total behaviors" value={String(snapshot.ledgerRows.length)} />
          <StatCell
            label="T1 · proven echo"
            value={String(snapshot.ledgerRows.filter((row) => row.tier === "T1").length)}
          />
          <StatCell
            label="T2 · pattern"
            value={String(snapshot.ledgerRows.filter((row) => row.tier === "T2").length)}
          />
          <StatCell
            label="T3 · exposure"
            value={String(snapshot.ledgerRows.filter((row) => row.tier === "T3").length)}
          />
        </div>
        {snapshot.ledgerRows.length ? (
          <LedgerTable rows={snapshot.ledgerRows} selectedId={snapshot.selected?.id} />
        ) : (
          <EmptyPanel title="No behaviors match these filters" />
        )}
      </section>
    </>
  );
}
