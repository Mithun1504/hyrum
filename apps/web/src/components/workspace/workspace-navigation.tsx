"use client";

import { Building2, ChevronLeft, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountControls } from "@/components/workspace/account-controls";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import {
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
  selectedParam: string;
};

export function WorkspaceNavigation(props: NavigationProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside
        className={cn(
          "glass-panel sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-y-0 border-l-0 transition-[width] duration-200 md:flex",
          collapsed ? "w-[76px]" : "w-[248px]",
        )}
      >
        <SidebarContent {...props} collapsed={collapsed} onNavigate={() => undefined} />
        <Button
          variant="outline"
          size="icon-sm"
          className="absolute -right-4 top-6 z-10 rounded-full bg-card shadow-md"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronLeft className={cn("transition-transform", collapsed && "rotate-180")} />
        </Button>
      </aside>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="glass-panel fixed left-3 top-3 z-[60] md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu aria-hidden="true" />
      </Button>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="glass-panel relative h-full w-[min(86vw,320px)] rounded-r-2xl border-y-0 border-l-0 p-0 shadow-2xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 z-10"
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
        className="glass-panel fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-2xl p-1.5 md:hidden"
        aria-label="Mobile navigation"
      >
        {workspaceNavItems
          .filter((item) =>
            (["capture", "ledger", "gate", "replay", "policy"] as ViewKey[]).includes(item.key),
          )
          .map((item) => {
            const Icon = item.icon;
            const active = props.currentView === item.key;
            return (
              <Link
                key={item.key}
                href={`/app?view=${item.key}${props.selectedParam}`}
                prefetch={false}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] text-muted-foreground",
                  active && "bg-primary text-primary-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.shortLabel}
                {item.key === "gate" && props.blockingCount > 0 ? (
                  <span className="absolute right-2 top-1 size-2 rounded-full bg-destructive" />
                ) : null}
              </Link>
            );
          })}
      </nav>
    </>
  );
}

function SidebarContent({
  currentView,
  actorLabel,
  role,
  organizationName,
  blockingCount,
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
          "flex h-11 items-center gap-3 rounded-xl px-2 font-semibold tracking-[0.22em]",
          collapsed && "justify-center px-0",
        )}
        onClick={onNavigate}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">
          H
        </span>
        <span className={cn("whitespace-nowrap", collapsed && "sr-only")}>HYRUM</span>
      </Link>
      <div
        className={cn(
          "mt-4 flex min-h-12 items-center gap-3 rounded-xl border bg-secondary/55 px-3",
          collapsed && "justify-center px-0",
        )}
        title={organizationName}
      >
        <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span
          className={cn("min-w-0 flex-1 truncate text-xs font-semibold", collapsed && "sr-only")}
        >
          {organizationName}
        </span>
        <Badge
          className={cn(
            "bg-status-success/15 text-[9px] text-status-success",
            collapsed && "sr-only",
          )}
        >
          LIVE
        </Badge>
      </div>
      <nav className="mt-5 grid gap-1" aria-label="Main navigation">
        {workspaceNavItems.map((item, index) => {
          const Icon = item.icon;
          const active = currentView === item.key;
          const showGroup = index === 0 || item.group !== workspaceNavItems[index - 1]?.group;
          return (
            <div key={item.key}>
              {showGroup ? (
                <p
                  className={cn(
                    "mb-1 mt-4 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground first:mt-0",
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
                className={cn(
                  "motion-lift flex min-h-11 items-center gap-3 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
                  active &&
                    "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary hover:text-primary-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className={cn("whitespace-nowrap", collapsed && "sr-only")}>
                  {item.label}
                </span>
                {item.key === "gate" && blockingCount > 0 ? (
                  <Badge
                    variant="destructive"
                    className={cn(
                      "ml-auto",
                      collapsed && "absolute ml-7 -mt-7 size-4 justify-center p-0 text-[8px]",
                    )}
                  >
                    {blockingCount}
                  </Badge>
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto border-t pt-4">
        <div
          className={cn("mb-2 flex items-center", collapsed ? "justify-center" : "justify-between")}
        >
          <ThemeToggle compact />
          <Search
            className={cn("size-4 text-muted-foreground", collapsed && "hidden")}
            aria-hidden="true"
          />
        </div>
        <div className={cn(collapsed && "[&_span]:sr-only")}>
          <AccountControls label={actorLabel} />
        </div>
        <span
          className={cn(
            "mt-1 block px-2 text-[10px] capitalize text-muted-foreground",
            collapsed && "sr-only",
          )}
        >
          {role} role
        </span>
      </div>
    </div>
  );
}
