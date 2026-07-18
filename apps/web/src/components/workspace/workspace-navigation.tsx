"use client";

import { ChevronLeft, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { AccountControls } from "@/components/workspace/account-controls";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import {
  mobilePrimaryNavKeys,
  type ViewKey,
  workspaceNavItems,
} from "@/components/workspace/workspace-navigation-config";
import { cn } from "@/lib/utils";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

type NavigationProps = {
  currentView: ViewKey;
  actorLabel: string;
  role: WorkspaceSnapshot["role"];
  organizationName: string;
  blockingCount: number;
  apiStatus: WorkspaceSnapshot["apiStatus"];
  selectedParam: string;
};

export function WorkspaceNavigation(props: NavigationProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r bg-industrial/95 transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <SidebarContent {...props} collapsed={collapsed} onNavigate={() => undefined} />
        <Button
          variant="outline"
          size="icon-sm"
          className="absolute -right-5 top-5 z-10 rounded-md bg-background transition-colors active:translate-y-0 active:scale-[0.98]"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronLeft
            className={cn("transition-transform duration-150 ease-out", collapsed && "rotate-180")}
          />
        </Button>
      </aside>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed left-3 top-3 z-[60] border bg-background transition-colors active:translate-y-0 active:scale-[0.98] md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu aria-hidden="true" />
      </Button>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[min(88vw,320px)] border-r bg-background p-0">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 z-10 transition-colors active:translate-y-0 active:scale-[0.98]"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
            <SidebarContent {...props} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-lg border bg-background p-1 md:hidden"
        aria-label="Mobile navigation"
      >
        {workspaceNavItems
          .filter((item) => isMobilePrimaryKey(item.key))
          .map((item) => {
            const active = props.currentView === item.key;
            return (
              <Link
                key={item.key}
                href={`/app?view=${item.key}${props.selectedParam}`}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center rounded-md px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-[0.98]",
                  active && "bg-secondary text-foreground",
                )}
              >
                <span className="text-[10px] text-muted-foreground">{item.step}</span>
                {item.shortLabel}
                {item.key === "gate" && props.blockingCount > 0 ? (
                  <span className="absolute right-1.5 top-1 rounded-sm bg-destructive px-1 text-[9px] leading-4 text-background">
                    {props.blockingCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        <button
          type="button"
          className={cn(
            "flex min-h-12 flex-col items-center justify-center rounded-md px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-[0.98]",
            !isMobilePrimaryKey(props.currentView) && "bg-secondary text-foreground",
          )}
          aria-label="Open full navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <span className="text-[10px] text-muted-foreground">••</span>
          More
        </button>
      </nav>
    </>
  );
}

function isMobilePrimaryKey(key: ViewKey) {
  return (mobilePrimaryNavKeys as readonly ViewKey[]).includes(key);
}

function SidebarContent({
  currentView,
  actorLabel,
  role,
  organizationName,
  blockingCount,
  apiStatus,
  selectedParam,
  collapsed,
  onNavigate,
}: NavigationProps & { collapsed: boolean; onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <Link
        href="/app"
        prefetch={false}
        className={cn(
          "flex min-h-12 items-center rounded-md px-2 transition-colors hover:bg-secondary",
          collapsed && "justify-center px-0 [&_span]:sr-only",
        )}
        onClick={onNavigate}
      >
        <BrandMark />
      </Link>
      <div
        className={cn(
          "mt-4 grid min-h-16 gap-1 rounded-md border bg-card px-3 py-3",
          collapsed && "justify-center px-0",
        )}
        title={organizationName}
      >
        <span className={cn("min-w-0 truncate text-sm font-medium", collapsed && "sr-only")}>
          {organizationName}
        </span>
        <span
          className={cn(
            "text-xs",
            apiStatus === "ok" && "text-status-success",
            apiStatus === "degraded" && "text-status-warning",
            apiStatus === "unavailable" && "text-destructive",
            collapsed && "sr-only",
          )}
        >
          Control plane {apiStatus === "ok" ? "live" : apiStatus}
        </span>
      </div>
      <nav
        className="scrollbar-thin mt-5 min-h-0 flex-1 overflow-y-auto pr-1"
        aria-label="Main navigation"
      >
        {workspaceNavItems.map((item, index) => {
          const active = currentView === item.key;
          const showGroup = index === 0 || item.group !== workspaceNavItems[index - 1]?.group;
          return (
            <div key={item.key}>
              {showGroup ? (
                <p
                  className={cn(
                    "mb-1 mt-4 px-3 text-xs font-medium text-muted-foreground first:mt-0",
                    collapsed && "sr-only",
                  )}
                >
                  {item.group}
                </p>
              ) : null}
              <Link
                href={`/app?view=${item.key}${selectedParam}`}
                prefetch={false}
                title={collapsed ? item.label : undefined}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-[0.98]",
                  active && "bg-secondary text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{item.step}</span>
                <span className={cn("whitespace-nowrap", collapsed && "sr-only")}>
                  {item.label}
                </span>
                {item.key === "gate" && blockingCount > 0 ? (
                  <span
                    className={cn(
                      "ml-auto min-w-6 rounded-sm bg-destructive/15 px-1.5 py-0.5 text-center text-xs text-destructive",
                      collapsed && "absolute ml-8 -mt-7 min-w-0 px-1 text-[9px]",
                    )}
                  >
                    {blockingCount}
                  </span>
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto border-t pt-4">
        {collapsed ? null : (
          <>
            <ThemeToggle />
            <div className="mt-3">
              <AccountControls label={actorLabel} />
            </div>
            <span className="mt-1 block text-[10px] capitalize text-muted-foreground">
              {role} role
            </span>
          </>
        )}
      </div>
    </div>
  );
}
