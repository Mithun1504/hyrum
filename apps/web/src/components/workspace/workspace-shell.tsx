import { CircleDot, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AssertionsView, ReplayView } from "@/components/workspace/assertion-replay-views";
import { BehaviorView, GateView } from "@/components/workspace/behavior-gate-views";
import { CaptureView, LedgerView } from "@/components/workspace/capture-ledger-views";
import { ConsumersView, EndpointsView, PolicyView } from "@/components/workspace/coverage-views";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { WorkspaceNavigation } from "@/components/workspace/workspace-navigation";
import {
  type ViewKey,
  workspaceNavItems,
} from "@/components/workspace/workspace-navigation-config";
import { DataStatusBanner } from "@/components/workspace/workspace-primitives";
import { cn } from "@/lib/utils";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

export function WorkspaceShell({
  snapshot,
  view,
  actorLabel,
}: {
  snapshot: WorkspaceSnapshot;
  view: ViewKey;
  actorLabel: string;
}) {
  const title = workspaceNavItems.find((item) => item.key === view)?.label ?? "Capture";
  const blockingCount = snapshot.replayReport?.decision.block_count ?? 0;
  const selectedParam = snapshot.selected
    ? `&entry=${encodeURIComponent(snapshot.selected.id)}`
    : "";

  return (
    <div className="flex min-h-dvh min-w-0 bg-background text-foreground">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to workspace
      </a>
      <WorkspaceNavigation
        currentView={view}
        actorLabel={actorLabel}
        role={snapshot.role}
        organizationName={snapshot.summary?.organization.name ?? "Organization unavailable"}
        blockingCount={blockingCount}
        selectedParam={selectedParam}
      />
      <main id="workspace-main" className="min-w-0 flex-1 pb-24 md:pb-0" tabIndex={-1}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/78 px-4 pl-16 backdrop-blur-xl md:h-16 md:px-6 xl:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="hidden text-[10px] text-muted-foreground sm:block">
              Live, tenant-scoped evidence
            </p>
          </div>
          <a
            href="/app?view=ledger"
            className="ml-auto hidden h-10 w-[min(34vw,360px)] items-center gap-2 rounded-xl border bg-card/70 px-3 text-left text-xs text-muted-foreground shadow-sm lg:flex"
            aria-label="Open ledger search"
          >
            <Search className="size-4" aria-hidden="true" />
            Search endpoints, consumers, behaviors…
            <kbd className="ml-auto rounded-md border bg-secondary px-1.5 py-0.5 text-[9px]">
              ⌘K
            </kbd>
          </a>
          <Badge
            variant="outline"
            className={cn(
              "gap-2 rounded-full bg-card/70 px-3",
              snapshot.apiStatus === "unavailable"
                ? "border-destructive/45 text-destructive"
                : "border-status-success/40 text-status-success",
            )}
          >
            <CircleDot
              className={cn("size-3", snapshot.apiStatus === "ok" && "live-pulse rounded-full")}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {snapshot.apiStatus === "ok" ? "Live" : snapshot.apiStatus}
            </span>
          </Badge>
          <ThemeToggle compact />
        </header>
        <div className="mx-auto w-full max-w-[1680px] px-4 py-5 md:px-6 md:py-7 xl:px-8">
          {snapshot.dataErrors.length > 0 ? (
            <DataStatusBanner errors={snapshot.dataErrors} />
          ) : null}
          {view === "capture" ? <CaptureView snapshot={snapshot} /> : null}
          {view === "ledger" ? <LedgerView snapshot={snapshot} /> : null}
          {view === "consumers" ? <ConsumersView snapshot={snapshot} /> : null}
          {view === "endpoints" ? <EndpointsView snapshot={snapshot} /> : null}
          {view === "behavior" ? <BehaviorView snapshot={snapshot} /> : null}
          {view === "gate" ? <GateView snapshot={snapshot} /> : null}
          {view === "assertions" ? <AssertionsView snapshot={snapshot} /> : null}
          {view === "replay" ? <ReplayView snapshot={snapshot} /> : null}
          {view === "policy" ? <PolicyView snapshot={snapshot} /> : null}
        </div>
      </main>
    </div>
  );
}

export function normalizeView(value: string | undefined): ViewKey {
  return workspaceNavItems.some((item) => item.key === value) ? (value as ViewKey) : "capture";
}
