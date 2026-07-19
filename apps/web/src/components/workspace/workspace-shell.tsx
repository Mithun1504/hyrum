import { AssertionsView, ReplayView } from "@/components/workspace/assertion-replay-views";
import { BehaviorView, GateView } from "@/components/workspace/behavior-gate-views";
import { CaptureView, LedgerView } from "@/components/workspace/capture-ledger-views";
import { ConsumersView, EndpointsView, PolicyView } from "@/components/workspace/coverage-views";
import { OverviewView } from "@/components/workspace/overview-view";
import { WorkspaceNavigation } from "@/components/workspace/workspace-navigation";
import {
  contextualWorkspaceViews,
  isWorkspaceViewKey,
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
  authBypass = false,
}: {
  snapshot: WorkspaceSnapshot;
  view: ViewKey;
  actorLabel: string;
  authBypass?: boolean;
}) {
  const title = workspaceNavItems.find((item) => item.key === view)?.label ?? "Overview";
  const contextualTitle = contextualWorkspaceViews.find((item) => item.key === view)?.label;
  const blockingCount = snapshot.replayReport?.decision.block_count ?? 0;
  const selectedParam = snapshot.selected
    ? `&entry=${encodeURIComponent(snapshot.selected.id)}`
    : "";

  return (
    <div className="flex min-h-dvh min-w-0 bg-background text-foreground">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to workspace
      </a>
      <WorkspaceNavigation
        currentView={view}
        actorLabel={actorLabel}
        role={snapshot.role}
        organizationName={snapshot.summary?.organization.name ?? "Organization unavailable"}
        blockingCount={blockingCount}
        apiStatus={snapshot.apiStatus}
        selectedParam={selectedParam}
        authBypass={authBypass}
      />
      <main id="workspace-main" className="min-w-0 flex-1 pb-24 md:pb-0" tabIndex={-1}>
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-4 border-b bg-background/95 px-4 pl-16 md:px-6 xl:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{contextualTitle ?? title}</p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Tenant-scoped receipts, replay, and policy
            </p>
          </div>
          <div
            className={cn(
              "ml-auto rounded-md border px-3 py-1.5 text-xs",
              snapshot.apiStatus === "ok" &&
                "border-status-success/35 bg-status-success/10 text-status-success",
              snapshot.apiStatus === "degraded" &&
                "border-status-warning/40 bg-status-warning/10 text-status-warning",
              snapshot.apiStatus === "unavailable" &&
                "border-destructive/45 bg-destructive/10 text-destructive",
            )}
          >
            <span className="hidden sm:inline">
              Control plane: {snapshot.apiStatus === "ok" ? "live" : snapshot.apiStatus}
            </span>
            <span className="sm:hidden">
              {snapshot.apiStatus === "ok" ? "live" : snapshot.apiStatus}
            </span>
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 md:px-6 md:py-6 xl:px-8">
          {snapshot.dataErrors.length > 0 ? (
            <DataStatusBanner errors={snapshot.dataErrors} />
          ) : null}
          {view === "overview" ? <OverviewView snapshot={snapshot} /> : null}
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
  return isWorkspaceViewKey(value) ? value : "overview";
}
