import { ArrowRight, Boxes, Network, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "@/components/workspace/tier-badge";
import { EmptyPanel, PageIntro } from "@/components/workspace/workspace-primitives";
import type { EvidenceTier, WorkspaceSnapshot } from "@/services/workspace-data";

export function ConsumersView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  if (!snapshot.consumers.length)
    return (
      <EmptyPanel
        title="No consumers observed"
        description="Consumers appear after tenant-scoped capture evidence is persisted."
      />
    );
  return (
    <>
      <PageIntro
        title="Consumer impact"
        desc="Understand which observed consumers receive accidental behaviors, with reliance tiers and receipt-backed counts."
      />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {snapshot.consumers.map((consumer) => {
          const rows = snapshot.allLedgerRows.filter((row) => row.consumer_id === consumer.id);
          const endpoints = new Set(rows.map((row) => row.endpoint)).size;
          const observations = rows.reduce((total, row) => total + row.observation_count, 0);
          return (
            <section key={consumer.id} className="glass-panel motion-lift rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/12 text-primary">
                  <Network className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{consumer.display_alias}</h2>
                  <p className="font-data truncate text-[10px] text-muted-foreground">
                    {consumer.stable_id}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="ml-auto border-status-success/40 text-status-success"
                >
                  Observed
                </Badge>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <MiniMetric label="Endpoints" value={endpoints} />
                <MiniMetric label="Behaviors" value={rows.length} />
                <MiniMetric label="Observations" value={observations} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {tierCounts(rows.map((row) => row.tier)).map(({ tier, count }) => (
                  <span key={tier} className="flex items-center gap-1">
                    <TierBadge tier={tier} compact />
                    <small className="text-muted-foreground">{count}</small>
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Last seen {formatDate(consumer.last_seen_at)}
              </p>
            </section>
          );
        })}
      </div>
    </>
  );
}

export function EndpointsView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const endpoints = [...new Set(snapshot.allLedgerRows.map((row) => row.endpoint))];
  if (!endpoints.length)
    return (
      <EmptyPanel
        title="No endpoint evidence"
        description="Endpoint coverage appears after undeclared behavior evidence is stored."
      />
    );
  return (
    <>
      <PageIntro
        title="Endpoint coverage"
        desc="See observed accidental behavior coverage by endpoint. These are live ledger facts, not declared OpenAPI coverage."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {endpoints.map((endpoint) => {
          const rows = snapshot.allLedgerRows.filter((row) => row.endpoint === endpoint);
          const consumers = new Set(rows.map((row) => row.consumer_id)).size;
          return (
            <section key={endpoint} className="glass-panel motion-lift overflow-hidden rounded-2xl">
              <div className="surface-grid flex items-center gap-3 border-b p-5">
                <span className="grid size-10 place-items-center rounded-2xl bg-tier-exposure/12 text-tier-exposure">
                  <Boxes className="size-5" />
                </span>
                <div>
                  <h2 className="font-data text-sm font-semibold">{endpoint}</h2>
                  <p className="text-xs text-muted-foreground">
                    {consumers} observed consumers · {rows.length} behaviors
                  </p>
                </div>
              </div>
              <div className="divide-y">
                {rows.slice(0, 5).map((row) => (
                  <div key={row.id} className="flex items-center gap-3 px-5 py-3 text-xs">
                    <TierBadge tier={row.tier} compact />
                    <span className="min-w-0 flex-1 truncate">{row.title}</span>
                    <span className="truncate text-muted-foreground">{row.consumer_alias}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export function PolicyView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const policy = snapshot.gatePolicy;
  return (
    <>
      <PageIntro
        title="Change policy"
        desc="The deterministic tier policy applied to replay deltas. T1 may block; lower tiers remain non-blocking by design."
      />
      {policy ? (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
          <section className="glass-panel rounded-2xl p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Policy version {policy.version}</h2>
                <p className="text-xs text-muted-foreground">
                  {policy.active ? "Active deterministic policy" : "Inactive policy"}
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <PolicyTier title="Blocks change" tiers={policy.block_tiers} />
              <ArrowRight className="mx-auto hidden size-5 text-muted-foreground sm:block" />
              <PolicyTier title="Warns only" tiers={policy.warn_tiers} />
            </div>
          </section>
          <section className="glass-panel rounded-2xl p-5">
            <h2 className="font-semibold">Enforcement boundary</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Replay determines behavior changes. Policy maps matched evidence tiers to outcomes.
              Advisory model output cannot create a blocking fact.
            </p>
          </section>
        </div>
      ) : (
        <EmptyPanel
          title="No gate policy available"
          description="The control plane did not return an active tenant policy."
        />
      )}
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <strong className="block text-lg">{value.toLocaleString()}</strong>
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
function tierCounts(tiers: EvidenceTier[]) {
  return (["T1", "T2", "T3"] as const)
    .map((tier) => ({ tier, count: tiers.filter((value) => value === tier).length }))
    .filter((item) => item.count > 0);
}
function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "not reported";
}
function PolicyTier({ title, tiers }: { title: string; tiers: EvidenceTier[] }) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {tiers.length ? (
          tiers.map((tier) => <TierBadge key={tier} tier={tier} />)
        ) : (
          <span className="text-xs text-muted-foreground">No tiers configured</span>
        )}
      </div>
    </div>
  );
}
