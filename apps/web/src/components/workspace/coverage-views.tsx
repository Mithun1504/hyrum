import Link from "next/link";
import type { ReactNode } from "react";
import { updatePolicyAction } from "@/app/(dashboard)/app/actions";
import { PolicyEditor } from "@/components/workspace/policy-editor";
import { TierBadge } from "@/components/workspace/tier-badge";
import { cn } from "@/lib/utils";
import type { EvidenceTier, LedgerRow, WorkspaceSnapshot } from "@/services/workspace-data";

const TIERS = ["T1", "T2", "T3"] as const satisfies readonly EvidenceTier[];
const TIER_RANK: Record<EvidenceTier, number> = { T1: 3, T2: 2, T3: 1 };

type ConsumerAuditItem = {
  consumer: WorkspaceSnapshot["consumers"][number];
  rows: LedgerRow[];
  strongest: LedgerRow | null;
  endpoints: number;
  observations: number;
  sessions: number;
  tiers: Record<EvidenceTier, number>;
  lastSeen: string | null;
};

type EndpointAuditItem = {
  endpoint: string;
  rows: LedgerRow[];
  strongest: LedgerRow | null;
  consumers: number;
  stale: number;
  tiers: Record<EvidenceTier, number>;
  lastSeen: string | null;
};

export function ConsumersView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const consumers = snapshot.consumers
    .map((consumer) => {
      const rows = snapshot.allLedgerRows.filter((row) => row.consumer_id === consumer.id);
      const strongest = strongestRow(rows);
      return {
        consumer,
        rows,
        strongest,
        endpoints: new Set(rows.map((row) => row.endpoint)).size,
        observations: sum(rows, "observation_count"),
        sessions: sum(rows, "session_count"),
        tiers: countTiers(rows),
        lastSeen: consumer.last_seen_at ?? strongest?.last_seen_at ?? null,
      };
    })
    .sort((a, b) => compareRisk(a.strongest, b.strongest) || b.observations - a.observations);

  if (!consumers.length) {
    return (
      <EmptyAuditState
        title="No consumers observed"
        description="Consumers appear after tenant-scoped capture persists redacted sequence evidence."
      />
    );
  }

  return (
    <>
      <SectionIntro
        title="Consumers"
        desc="Start here when the question is who is exposed. Each row rolls up the complete retained tenant ledger for one stable consumer identity."
      />
      <AuditPanel>
        <MobileList>
          {consumers.map((item) => (
            <ConsumerCard key={item.consumer.id} item={item} />
          ))}
        </MobileList>
        <DesktopTable
          headers={[
            "Consumer",
            "Strongest evidence",
            "Reach",
            "Evidence mix",
            "Last seen",
            "Next review",
          ]}
        >
          {consumers.map((item) => (
            <tr key={item.consumer.id} className="border-b border-border/70 last:border-b-0">
              <RowHeader
                title={item.consumer.display_alias}
                detail={item.consumer.stable_id}
                href={ledgerHref(item.consumer.display_alias)}
              />
              <EvidenceCell row={item.strongest} empty="No accidental behavior yet" />
              <td className="px-4 py-4 text-sm">
                {item.endpoints} endpoint labels · {item.rows.length} retained entries
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.observations.toLocaleString()} observations across{" "}
                  {item.sessions.toLocaleString()} sessions
                </p>
              </td>
              <TierCountCell counts={item.tiers} />
              <td className="px-4 py-4 text-sm text-muted-foreground">
                {formatDate(item.lastSeen)}
              </td>
              <td className="px-4 py-4">
                <ReviewLink
                  row={item.strongest}
                  fallback={ledgerHref(item.consumer.display_alias)}
                />
              </td>
            </tr>
          ))}
        </DesktopTable>
      </AuditPanel>
    </>
  );
}

export function EndpointsView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const endpoints = [...new Set(snapshot.allLedgerRows.map((row) => row.endpoint))]
    .map((endpoint) => {
      const rows = snapshot.allLedgerRows.filter((row) => row.endpoint === endpoint);
      const strongest = strongestRow(rows);
      return {
        endpoint,
        rows,
        strongest,
        consumers: new Set(rows.map((row) => row.consumer_id)).size,
        stale: rows.filter((row) => row.state === "stale").length,
        tiers: countTiers(rows),
        lastSeen: latestDate(rows.map((row) => row.last_seen_at)),
      };
    })
    .sort((a, b) => compareRisk(a.strongest, b.strongest) || b.rows.length - a.rows.length);

  if (!endpoints.length) {
    return (
      <EmptyAuditState
        title="No endpoint evidence"
        description="Endpoint context appears after undeclared behavior evidence is stored in the ledger."
      />
    );
  }

  return (
    <>
      <SectionIntro
        title="Endpoints"
        desc="These are endpoint labels retained across the complete tenant ledger. They are useful investigation context, not endpoint-scoped totals, because behavior identity can span operations."
      />
      <AuditPanel>
        <MobileList>
          {endpoints.map((item) => (
            <EndpointCard key={item.endpoint} item={item} />
          ))}
        </MobileList>
        <DesktopTable
          headers={[
            "Endpoint",
            "Strongest behavior",
            "Retained references",
            "Evidence mix",
            "Freshness",
            "Next review",
          ]}
        >
          {endpoints.map((item) => (
            <tr key={item.endpoint} className="border-b border-border/70 last:border-b-0">
              <RowHeader
                title={item.endpoint}
                detail="Observed accidental-contract surface"
                href={ledgerHref(item.endpoint)}
              />
              <EvidenceCell row={item.strongest} empty="No behavior rows" />
              <td className="px-4 py-4 text-sm">
                {item.consumers} consumers · {item.rows.length} retained entries
                <p className="mt-1 text-xs text-muted-foreground">
                  Counts reflect retained endpoint labels, not endpoint-scoped observations.
                </p>
              </td>
              <TierCountCell counts={item.tiers} />
              <td className="px-4 py-4 text-sm text-muted-foreground">
                {formatDate(item.lastSeen)}
                <p
                  className={cn(
                    "mt-1 text-xs",
                    item.stale ? "text-tier-pattern" : "text-muted-foreground",
                  )}
                >
                  {item.stale ? `${item.stale} stale` : "Fresh"}
                </p>
              </td>
              <td className="px-4 py-4">
                <ReviewLink row={item.strongest} fallback={ledgerHref(item.endpoint)} />
              </td>
            </tr>
          ))}
        </DesktopTable>
      </AuditPanel>
    </>
  );
}

export function PolicyView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const policy = snapshot.gatePolicy;

  return (
    <>
      <SectionIntro
        title="Policy"
        desc="Evidence classification and gate outcome are separate. Replay measures the delta; this active tenant policy maps matched tiers to the decision."
      />
      {policy ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <AuditPanel>
            <div className="grid gap-4 border-b border-border/70 p-4 md:grid-cols-3 md:p-6">
              <PolicyFact label="Version" value={`v${policy.version}`} />
              <PolicyFact label="State" value={policy.active ? "Active" : "Inactive"} />
              <PolicyFact
                label="Configured outcomes"
                value={`${policy.block_tiers.length} block · ${policy.warn_tiers.length} warn`}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/70 text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium md:px-6">Evidence tier</th>
                    <th className="px-4 py-3 font-medium">What it proves</th>
                    <th className="px-4 py-3 font-medium">Current gate outcome</th>
                    <th className="px-4 py-3 font-medium md:pr-6">Boundary</th>
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map((tier) => (
                    <tr key={tier} className="border-b border-border/70 last:border-b-0">
                      <td className="px-4 py-4 md:px-6">
                        <TierBadge tier={tier} />
                      </td>
                      <td className="px-4 py-4 text-sm">{tierMeaning(tier)}</td>
                      <td className="px-4 py-4 text-sm font-medium">
                        {policyOutcome(tier, policy)}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground md:pr-6">
                        {tierBoundary(tier)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AuditPanel>
          <section className="rounded-lg border border-border bg-card p-4 md:p-6">
            <h2 className="text-base font-semibold">Decision boundary</h2>
            <div className="mt-4 grid gap-4 text-sm text-muted-foreground">
              <p>Deterministic replay finds shape, ordering, error, and status deltas.</p>
              <p>Policy can change the outcome mapping for matched tiers.</p>
              <p>
                Model output may label or explain evidence, but it cannot create a blocking fact.
              </p>
            </div>
            <div className="mt-6 border-t border-border pt-6">
              <PolicyEditor
                policy={policy}
                canManage={snapshot.permissions.canManagePolicy}
                action={updatePolicyAction}
              />
            </div>
          </section>
        </div>
      ) : (
        <EmptyAuditState
          title="No gate policy available"
          description="The control plane did not return an active tenant policy for this organization."
        />
      )}
    </>
  );
}

function ConsumerCard({ item }: { item: ConsumerAuditItem }) {
  return (
    <MobileAuditCard
      title={item.consumer.display_alias}
      detail={item.consumer.stable_id}
      href={ledgerHref(item.consumer.display_alias)}
      strongest={item.strongest}
      meta={`${item.endpoints} endpoint labels · ${item.rows.length} retained entries · ${formatDate(item.lastSeen)}`}
    >
      <TierCounts counts={item.tiers} />
    </MobileAuditCard>
  );
}

function EndpointCard({ item }: { item: EndpointAuditItem }) {
  return (
    <MobileAuditCard
      title={item.endpoint}
      detail={`${item.consumers} consumers · ${item.rows.length} loaded entry references`}
      href={ledgerHref(item.endpoint)}
      strongest={item.strongest}
      meta={
        item.stale
          ? `${item.stale} stale · ${formatDate(item.lastSeen)}`
          : `Fresh · ${formatDate(item.lastSeen)}`
      }
    >
      <TierCounts counts={item.tiers} />
    </MobileAuditCard>
  );
}

function SectionIntro({ title, desc }: { title: string; desc: string }) {
  return (
    <header className="mb-6 max-w-3xl">
      <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
    </header>
  );
}

function AuditPanel({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {children}
    </section>
  );
}

function DesktopTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border/70 text-xs text-muted-foreground">
            {headers.map((header, index) => (
              <th
                key={header}
                className={cn(
                  "px-4 py-3 font-medium",
                  index === 0 && "pl-6",
                  index === headers.length - 1 && "pr-6",
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function MobileList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border md:hidden">{children}</div>;
}

function MobileAuditCard({
  title,
  detail,
  href,
  strongest,
  meta,
  children,
}: {
  title: string;
  detail: string;
  href: string;
  strongest: LedgerRow | null;
  meta: string;
  children: ReactNode;
}) {
  return (
    <article className="p-4">
      <Link
        className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        href={href}
        prefetch={false}
      >
        <h2 className="break-words text-sm font-semibold">{title}</h2>
        <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
      </Link>
      <div className="mt-4 grid gap-3">
        {children}
        <EvidenceSummary row={strongest} />
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </article>
  );
}

function RowHeader({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <td className="px-4 py-4 pl-6">
      <Link
        className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        href={href}
        prefetch={false}
      >
        <span className="block break-words text-sm font-semibold">{title}</span>
        <span className="mt-1 block break-words text-xs text-muted-foreground">{detail}</span>
      </Link>
    </td>
  );
}

function EvidenceCell({ row, empty }: { row: LedgerRow | null; empty: string }) {
  return (
    <td className="px-4 py-4">
      <EvidenceSummary row={row} empty={empty} />
    </td>
  );
}

function EvidenceSummary({
  row,
  empty = "No linked ledger entry",
}: {
  row: LedgerRow | null;
  empty?: string;
}) {
  if (!row) return <span className="text-sm text-muted-foreground">{empty}</span>;
  return (
    <div className="grid gap-2 text-sm">
      <TierBadge tier={row.tier} compact />
      <Link
        className="break-words font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        href={behaviorHref(row)}
        prefetch={false}
      >
        {row.title}
      </Link>
      <p className="text-xs text-muted-foreground">{row.consumer_alias}</p>
    </div>
  );
}

function TierCountCell({ counts }: { counts: Record<EvidenceTier, number> }) {
  return (
    <td className="px-4 py-4">
      <TierCounts counts={counts} />
    </td>
  );
}

function TierCounts({ counts }: { counts: Record<EvidenceTier, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TIERS.map((tier) => (
        <span
          key={tier}
          className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs"
        >
          <TierShape tier={tier} />
          <span className="font-medium">{counts[tier]}</span>
          <span className="text-muted-foreground">{tier}</span>
        </span>
      ))}
    </div>
  );
}

function TierShape({ tier }: { tier: EvidenceTier }) {
  const shape = tier === "T1" ? "■" : tier === "T2" ? "▲" : "●";
  return (
    <span className={cn("text-xs", tierTone(tier))} aria-hidden="true">
      {shape}
    </span>
  );
}

function ReviewLink({ row, fallback }: { row: LedgerRow | null; fallback: string }) {
  const href = row ? behaviorHref(row) : fallback;
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-foreground hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      href={href}
      prefetch={false}
    >
      Review
    </Link>
  );
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function EmptyAuditState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-card p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    </section>
  );
}

function strongestRow(rows: LedgerRow[]) {
  return [...rows].sort(compareRisk).at(0) ?? null;
}

function compareRisk(a: LedgerRow | null, b: LedgerRow | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return (
    TIER_RANK[b.tier] - TIER_RANK[a.tier] || Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at)
  );
}

function countTiers(rows: LedgerRow[]) {
  const counts = { T1: 0, T2: 0, T3: 0 } satisfies Record<EvidenceTier, number>;
  for (const row of rows) counts[row.tier] += 1;
  return counts;
}

function sum(rows: LedgerRow[], key: "observation_count" | "session_count") {
  return rows.reduce((total, row) => total + row[key], 0);
}

function latestDate(values: string[]) {
  return values.sort((a, b) => Date.parse(b) - Date.parse(a)).at(0) ?? null;
}

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not reported";
}

function behaviorHref(row: LedgerRow) {
  return `/app?view=behavior&entry=${encodeURIComponent(row.id)}`;
}

function ledgerHref(query: string) {
  return `/app?view=ledger&q=${encodeURIComponent(query)}`;
}

function tierTone(tier: EvidenceTier) {
  if (tier === "T1") return "text-tier-proof";
  if (tier === "T2") return "text-tier-pattern";
  return "text-tier-exposure";
}

function tierMeaning(tier: EvidenceTier) {
  if (tier === "T1") return "Echoed value receipt in a later request.";
  if (tier === "T2") return "Pattern evidence that suggests consumer branching.";
  return "Exposure only: the consumer received it, but reliance was not proven.";
}

function tierBoundary(tier: EvidenceTier) {
  if (tier === "T1") return "May block because the receipt proves client echo reliance.";
  if (tier === "T2") return "Warns by default. It is suggestive, not blocking proof.";
  return "Never a dependency and never a blocking reason.";
}

function policyOutcome(tier: EvidenceTier, policy: NonNullable<WorkspaceSnapshot["gatePolicy"]>) {
  if (tier === "T1" && policy.block_tiers.includes(tier)) return "Blocks change";
  if (policy.warn_tiers.includes(tier)) return "Warns only";
  return tier === "T3" ? "Exposure note" : "Records only";
}
