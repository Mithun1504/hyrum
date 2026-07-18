import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EvidenceTier, LedgerRow, WorkspaceSnapshot } from "@/services/workspace-data";

export function OverviewView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const decision = snapshot.replayReport?.decision;
  const outcome = decision?.outcome ?? "unknown";
  const tierCounts = countByTier(snapshot.allLedgerRows);
  const assertionCounts = countAssertions(snapshot.assertions);
  const reviewQueue = buildReviewQueue(snapshot);

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-6">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Latest gate decision</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] md:text-3xl">
            {decisionTitle(outcome)}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {decision
              ? (decision.reasons[0] ?? "Differential replay finished with no policy reason.")
              : "No replay report is loaded yet. Capture traffic first, then run replay against a candidate build."}
          </p>
        </div>
        <Link
          href="/app?view=gate"
          prefetch={false}
          className="inline-flex min-h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-secondary active:scale-[0.98]"
        >
          Open change gate
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4">
          <OverviewPanel
            title="Review first"
            actionHref="/app?view=ledger"
            actionLabel="Open ledger"
          >
            <div className="divide-y divide-border">
              {reviewQueue.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  className="grid gap-1 px-4 py-3 transition-colors hover:bg-secondary/65 active:scale-[0.995]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusMark tone={item.tone}>{item.marker}</StatusMark>
                    <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
                  </span>
                  <span className="min-w-0 break-words text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                </Link>
              ))}
              {reviewQueue.length === 0 ? (
                <p className="px-4 py-5 text-sm text-muted-foreground">
                  Nothing is waiting in the loaded ledger window or assertion list.
                </p>
              ) : null}
            </div>
          </OverviewPanel>

          <OverviewPanel title="Workflow trace">
            <div className="divide-y divide-border md:grid md:grid-cols-4 md:divide-x md:divide-y-0">
              <WorkflowStep
                step="01"
                title="Capture"
                body={`${snapshot.summary?.capture.sessions_24h ?? 0} sessions, ${
                  snapshot.summary?.capture.evidence_events_24h ?? 0
                } evidence events in 24h`}
                href="/app?view=capture"
              />
              <WorkflowStep
                step="02"
                title="Ledger"
                body={`Latest ${snapshot.allLedgerRows.length} entries: ${tierCounts.T1} T1, ${tierCounts.T2} T2, ${tierCounts.T3} T3`}
                href="/app?view=ledger"
              />
              <WorkflowStep
                step="03"
                title="Gate"
                body={
                  decision
                    ? `${decision.block_count} block, ${decision.warn_count} warn, ${decision.note_count} note`
                    : "No replay decision loaded"
                }
                href="/app?view=gate"
              />
              <WorkflowStep
                step="04"
                title="Assertions"
                body={`${assertionCounts.active} active, ${assertionCounts.expired} expired, ${assertionCounts.resolved} resolved`}
                href="/app?view=assertions"
              />
            </div>
          </OverviewPanel>
        </div>

        <OverviewPanel title="Recent progress">
          <div className="divide-y divide-border">
            {snapshot.progressEvents.slice(-6).map((event) => (
              <div key={event.id} className="grid gap-1 px-4 py-3">
                <span className="text-sm font-medium">{progressEventLabel(event.topic)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {shortResourceId(event.resource_id)} · {formatDate(event.created_at)}
                </span>
              </div>
            ))}
            {snapshot.progressEvents.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                Capture, ledger, replay, and assertion events will appear here.
              </p>
            ) : null}
          </div>
        </OverviewPanel>
      </div>
    </section>
  );
}

function OverviewPanel({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-12 items-center gap-3 border-b px-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            prefetch={false}
            className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-[0.98]"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function WorkflowStep({
  step,
  title,
  body,
  href,
}: {
  step: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="grid min-h-28 content-start gap-2 p-4 transition-colors hover:bg-secondary active:scale-[0.995]"
    >
      <span className="text-xs text-muted-foreground">{step}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </Link>
  );
}

function StatusMark({ tone, children }: { tone: "block" | "warn" | "note"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-sm border text-xs font-semibold",
        tone === "block" && "border-destructive/50 bg-destructive/10 text-destructive",
        tone === "warn" && "border-tier-pattern/50 bg-tier-pattern/10 text-tier-pattern",
        tone === "note" && "border-tier-exposure/50 bg-tier-exposure/10 text-tier-exposure",
      )}
    >
      {children}
    </span>
  );
}

function buildReviewQueue(snapshot: WorkspaceSnapshot) {
  const t1Rows = snapshot.allLedgerRows
    .filter((row) => row.tier === "T1" && row.state === "active")
    .map((row) => ledgerQueueItem(row));
  const t2Rows = snapshot.allLedgerRows
    .filter((row) => row.tier === "T2" && row.state === "active")
    .map((row) => ({
      ...ledgerQueueItem(row),
      tone: "warn" as const,
      marker: "T2",
      detail: `${row.endpoint} · ${row.consumer_alias} · warning only`,
    }));
  const expiredAssertions = snapshot.assertions
    .filter((assertion) => assertion.status === "expired")
    .map((assertion) => {
      const row = snapshot.allLedgerRows.find(
        (candidate) => candidate.behavior_id === assertion.behavior_id,
      );
      return {
        key: assertion.id,
        title: "Assertion expired",
        detail: `${assertion.reason} · expired ${formatDate(assertion.expires_at)}`,
        href: row
          ? `/app?view=assertions&entry=${encodeURIComponent(row.id)}`
          : "/app?view=assertions",
        tone: "warn" as const,
        marker: "EX",
      };
    });

  return [...t1Rows, ...expiredAssertions, ...t2Rows].slice(0, 5);
}

function ledgerQueueItem(row: LedgerRow) {
  return {
    key: row.id,
    title: row.title,
    detail: `${row.endpoint} · ${row.consumer_alias} · ${row.observation_count} observations across ${sessionCount(row.session_count)} · ${row.receipt_id ? "receipt attached" : "no active receipt"}`,
    href: `/app?view=behavior&entry=${encodeURIComponent(row.id)}`,
    tone: tierTone(row.tier),
    marker: row.tier,
  };
}

function progressEventLabel(topic: WorkspaceSnapshot["progressEvents"][number]["topic"]) {
  if (topic === "capture.batch_ingested") return "Capture batch ingested";
  if (topic === "ledger.updated") return "Ledger updated";
  if (topic === "replay.report_ingested") return "Replay report ingested";
  if (topic === "assertion.pinned") return "Assertion pinned";
  return "Assertion expired";
}

function shortResourceId(resourceId: string | null) {
  if (!resourceId) return "tenant event";
  return resourceId.length > 20 ? `${resourceId.slice(0, 8)}…${resourceId.slice(-4)}` : resourceId;
}

function sessionCount(count: number) {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}

function countByTier(rows: LedgerRow[]) {
  return rows.reduce<Record<EvidenceTier, number>>(
    (counts, row) => {
      counts[row.tier] += 1;
      return counts;
    },
    { T1: 0, T2: 0, T3: 0 },
  );
}

function countAssertions(assertions: WorkspaceSnapshot["assertions"]) {
  return assertions.reduce(
    (counts, assertion) => {
      counts[assertion.status] += 1;
      return counts;
    },
    { active: 0, expired: 0, resolved: 0 },
  );
}

function decisionTitle(outcome: "pass" | "warn" | "block" | "unknown") {
  if (outcome === "block") return "This candidate is blocked.";
  if (outcome === "warn") return "This candidate needs review.";
  if (outcome === "pass") return "The Hyrum gate passed.";
  return "No gate decision yet.";
}

function tierTone(tier: EvidenceTier) {
  if (tier === "T1") return "block" as const;
  if (tier === "T2") return "warn" as const;
  return "note" as const;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
