import {
  Activity,
  AlertOctagon,
  type Database,
  ListFilter,
  Pin,
  RadioTower,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AccountControls } from "@/components/workspace/account-controls";
import { AssertionsView, ReplayView } from "@/components/workspace/assertion-replay-views";
import { BehaviorView, GateView } from "@/components/workspace/behavior-gate-views";
import { CaptureView, LedgerView } from "@/components/workspace/capture-ledger-views";
import { MobileMenu } from "@/components/workspace/mobile-menu";
import { DataStatusBanner } from "@/components/workspace/workspace-primitives";
import { cn } from "@/lib/utils";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

type ViewKey = "capture" | "ledger" | "behavior" | "gate" | "assertions" | "replay";

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Database }> = [
  { key: "capture", label: "Capture", icon: RadioTower },
  { key: "ledger", label: "Ledger", icon: ListFilter },
  { key: "behavior", label: "Behavior detail", icon: Workflow },
  { key: "gate", label: "Change gate", icon: AlertOctagon },
  { key: "assertions", label: "Assertions", icon: Pin },
  { key: "replay", label: "Replay health", icon: Activity },
];

export function WorkspaceShell({
  snapshot,
  view,
  actorLabel,
}: {
  snapshot: WorkspaceSnapshot;
  view: ViewKey;
  actorLabel: string;
}) {
  const title = navItems.find((item) => item.key === view)?.label ?? "Capture";
  const blockingCount = snapshot.replayReport?.decision.block_count ?? 0;
  const selectedParam = snapshot.selected
    ? `&entry=${encodeURIComponent(snapshot.selected.id)}`
    : "";

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground md:grid md:grid-cols-[232px_1fr]">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-primary-foreground"
      >
        Skip to workspace
      </a>
      <MobileMenu>
        <Sidebar
          currentView={view}
          actorLabel={actorLabel}
          role={snapshot.role}
          live={snapshot.dataMode === "live"}
          blockingCount={blockingCount}
          selectedParam={selectedParam}
        />
      </MobileMenu>
      <main id="workspace-main" className="min-w-0" tabIndex={-1}>
        <header className="flex h-14 items-center gap-3 border-b border-border py-0 pr-4 pl-16 md:h-12 md:px-8">
          <div className="min-w-0 font-sans text-sm font-semibold">
            {title}{" "}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              · {snapshot.dataMode === "live" ? "live evidence" : "demo evidence"}
            </span>
          </div>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 border-tier-proof/50 text-tier-proof",
                snapshot.apiStatus === "unavailable" && "border-destructive/50 text-destructive",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              capture {snapshot.apiStatus === "ok" ? "healthy" : snapshot.apiStatus}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground uppercase">
              {snapshot.dataMode}
            </Badge>
          </div>
        </header>
        <div className="px-4 py-5 md:px-8 md:py-8">
          {snapshot.dataErrors.length > 0 ? (
            <DataStatusBanner errors={snapshot.dataErrors} />
          ) : null}
          {view === "capture" ? <CaptureView snapshot={snapshot} /> : null}
          {view === "ledger" ? <LedgerView snapshot={snapshot} /> : null}
          {view === "behavior" ? <BehaviorView snapshot={snapshot} /> : null}
          {view === "gate" ? <GateView snapshot={snapshot} /> : null}
          {view === "assertions" ? <AssertionsView snapshot={snapshot} /> : null}
          {view === "replay" ? <ReplayView snapshot={snapshot} /> : null}
        </div>
      </main>
    </div>
  );
}

export function normalizeView(value: string | undefined): ViewKey {
  return navItems.some((item) => item.key === value) ? (value as ViewKey) : "capture";
}

function Sidebar({
  currentView,
  actorLabel,
  role,
  live,
  blockingCount,
  selectedParam,
}: {
  currentView: ViewKey;
  actorLabel: string;
  role: WorkspaceSnapshot["role"];
  live: boolean;
  blockingCount: number;
  selectedParam: string;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <Link
        href="/app"
        prefetch={false}
        className="px-2 font-sans text-xl font-extrabold uppercase tracking-wide"
      >
        HYRUM<span className="text-tier-proof">_</span>
      </Link>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px]">
        <b>{live ? "Organization workspace" : "Reference workspace"}</b>
        <Badge className="ml-auto h-5 bg-tier-proof/25 text-[9px] text-tier-proof">
          {live ? "LIVE" : "DEMO"}
        </Badge>
      </div>
      <nav className="grid gap-1" aria-label="Main">
        {navItems.map((item, index) => (
          <NavLink
            key={item.key}
            item={item}
            currentView={currentView}
            showGroup={index === 3}
            count={item.key === "gate" ? blockingCount : 0}
            selectedParam={selectedParam}
          />
        ))}
      </nav>
      <div className="mt-auto border-t border-border px-2 pt-4 text-[11px] text-muted-foreground">
        {live ? (
          <AccountControls label={actorLabel} />
        ) : (
          <b className="text-foreground">Demo user</b>
        )}
        <span className="mt-2 block capitalize">{role} role</span>
      </div>
    </div>
  );
}

function NavLink({
  item,
  currentView,
  showGroup,
  count,
  selectedParam,
}: {
  item: (typeof navItems)[number];
  currentView: ViewKey;
  showGroup: boolean;
  count: number;
  selectedParam: string;
}) {
  const Icon = item.icon;
  return (
    <>
      {showGroup ? (
        <div className="px-2 pt-4 pb-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          Enforcement
        </div>
      ) : null}
      <Link
        href={`/app?view=${item.key}${selectedParam}`}
        prefetch={false}
        className={cn(
          "flex h-11 items-center gap-3 rounded-lg px-3 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          currentView === item.key && "bg-secondary text-foreground ring-1 ring-border",
        )}
      >
        <Icon className="size-4 text-tier-proof" aria-hidden="true" />
        {item.label}
        {count > 0 ? (
          <span className="ml-auto rounded-full bg-destructive/25 px-2 text-[10px] font-bold text-destructive">
            {count}
          </span>
        ) : null}
      </Link>
    </>
  );
}
