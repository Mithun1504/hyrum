import { ArrowRight, Filter, RadioTower, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressStream } from "@/components/workspace/progress-stream";
import {
  EmptyPanel,
  LedgerTable,
  PageIntro,
  SelectFilter,
  StatCard,
  StatCell,
} from "@/components/workspace/workspace-primitives";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

export function CaptureView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const capture = snapshot.summary?.capture;

  return (
    <>
      <PageIntro
        title="Capture"
        desc="Session-correlated sampling keeps whole consumer-sessions: the follow-up call that proves an echo must survive the sample. Payload values never leave your VPC."
      />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="glass-panel surface-grid min-w-0 rounded-2xl p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Evidence pipeline</h2>
              <p className="text-xs text-muted-foreground">
                Redaction happens before evidence leaves your infrastructure.
              </p>
            </div>
            <RadioTower className="size-5 text-primary" />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            {[
              "Gateway|your API edge",
              "Capture agent|self-hosted · redacts",
              "Control plane|redacted evidence only",
            ].map((stage, index) => {
              const [label, detail] = stage.split("|");
              return (
                <div className="contents" key={stage}>
                  <div className="evidence-glow motion-lift min-w-0 rounded-2xl border border-border bg-card/80 px-4 py-4 text-center shadow-sm">
                    <span className="mx-auto mb-2 grid size-8 place-items-center rounded-xl bg-status-success/12 text-status-success">
                      <ShieldCheck className="size-4" />
                    </span>
                    <b className="text-xs">{label}</b>
                    <p className="text-[10px] text-muted-foreground">{detail}</p>
                    <p className="mt-2 flex items-center justify-center gap-1 text-[9px] text-status-success">
                      <span className="size-1.5 rounded-full bg-current" /> Healthy
                    </p>
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
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-[96px_1fr]">
            <dt className="text-muted-foreground">correlation</dt>
            <dd>consumer session identifiers from your capture agent</dd>
            <dt className="text-muted-foreground">redaction</dt>
            <dd>applied inside your infrastructure before egress</dd>
            <dt className="text-muted-foreground">retention</dt>
            <dd>
              {snapshot.summary
                ? `${snapshot.summary.organization.retention_days} days for this organization`
                : "unavailable"}
            </dd>
            <dt className="text-muted-foreground">status</dt>
            <dd>{snapshot.apiStatus === "ok" ? "ready for capture" : snapshot.apiStatus}</dd>
          </dl>
        </section>
        <section className="grid min-w-0 grid-cols-2 content-start gap-3">
          <StatCard
            label="Endpoints"
            value={capture ? String(capture.endpoint_count) : "—"}
            delta="observed with evidence"
          />
          <StatCard
            label="Consumers"
            value={capture ? String(capture.consumer_count) : "—"}
            delta="tenant-scoped"
          />
          <StatCard
            label="Sessions / 24h"
            value={capture ? String(capture.sessions_24h) : "—"}
            delta="persisted sessions"
          />
          <StatCard
            label="Events / 24h"
            value={capture ? String(capture.evidence_events_24h) : "—"}
            delta="evidence-bearing events"
          />
        </section>
      </div>
      <ProgressStream initialEvents={snapshot.progressEvents} live />
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
      <form className="glass-panel mb-4 grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <input type="hidden" name="view" value="ledger" />
        <label className="grid gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={snapshot.filters.query}
            className="h-11 rounded-xl border border-input bg-background/75 px-3 text-xs normal-case tracking-normal text-foreground"
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
        <Button type="submit" className="self-end shadow-lg shadow-primary/15">
          <Filter aria-hidden="true" /> Filter
        </Button>
      </form>
      <section className="glass-panel overflow-hidden rounded-2xl">
        <div className="grid grid-cols-2 border-b bg-card/45 md:grid-cols-4">
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
          <div className="border-b p-4">
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground">
              <span>Evidence tier summary</span>
              <span>{snapshot.ledgerRows.length} behaviors</span>
            </div>
            <div className="flex h-8 overflow-hidden rounded-xl text-[10px] font-semibold text-white">
              {(["T1", "T2", "T3"] as const).map((tier) => {
                const count = snapshot.ledgerRows.filter((row) => row.tier === tier).length;
                return count ? (
                  <div
                    key={tier}
                    className={
                      tier === "T1"
                        ? "grid place-items-center bg-tier-proof"
                        : tier === "T2"
                          ? "grid place-items-center bg-tier-pattern"
                          : "grid place-items-center bg-tier-exposure"
                    }
                    style={{ flexGrow: count }}
                  >
                    <span>
                      {tier} · {count}
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        ) : null}
        {snapshot.ledgerRows.length ? (
          <LedgerTable rows={snapshot.ledgerRows} selectedId={snapshot.selected?.id} />
        ) : (
          <EmptyPanel title="No behaviors match these filters" />
        )}
      </section>
    </>
  );
}
