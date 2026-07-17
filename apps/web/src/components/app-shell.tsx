import type { ApiService, OrganizationRole, Permission } from "@hyrum/contracts";
import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/(dashboard)/app/actions";
import { DesktopNavigation, MobileNavigation, ServiceSwitcher } from "@/components/app-navigation";
import { BrandMark } from "@/components/brand-mark";
import { GlobalSearch } from "@/components/global-search";
import { LiveStatus } from "@/components/live-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface AppShellProps {
  children: React.ReactNode;
  organizationName: string;
  organizationStatus: string;
  role: OrganizationRole;
  permissions: Permission[];
  userEmail: string;
  services: readonly Pick<ApiService, "id" | "name" | "slug" | "status">[];
  unreadNotificationCount: number;
}

export function AppShell({
  children,
  organizationName,
  organizationStatus,
  role,
  permissions,
  userEmail,
  services,
  unreadNotificationCount,
}: Readonly<AppShellProps>) {
  return (
    <div className="min-h-dvh bg-muted/20 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside
        className="hidden border-r bg-background lg:flex lg:flex-col"
        aria-label="Workspace sidebar"
      >
        <div className="flex h-16 items-center px-5">
          <Link href="/app" aria-label="Hyrum workspace">
            <BrandMark />
          </Link>
        </div>
        <Separator />
        <div className="space-y-4 p-3">
          <ServiceSwitcher
            services={services}
            canManageServices={permissions.includes("service:manage")}
          />
          <DesktopNavigation
            services={services}
            canManageServices={permissions.includes("service:manage")}
          />
        </div>
        <div className="mt-auto border-t p-4">
          <p className="truncate text-sm font-medium">{userEmail}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{role}</p>
          <Link
            href="/app/select-organization"
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            Switch workspace
          </Link>
          <form action={signOutAction} className="mt-1">
            <Button type="submit" variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-xs">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-16 items-center gap-3 px-page">
            <MobileNavigation
              services={services}
              canManageServices={permissions.includes("service:manage")}
            />
            <Link href="/app" className="lg:hidden" aria-label="Hyrum workspace home">
              <BrandMark className="[&_span:last-child]:hidden sm:[&_span:last-child]:inline" />
            </Link>
            <div className="min-w-0">
              <Link
                href="/app/select-organization"
                className="block truncate text-sm font-medium hover:underline"
              >
                {organizationName}
              </Link>
              <p className="text-xs capitalize text-muted-foreground">{organizationStatus}</p>
            </div>
            <Badge variant="outline" className="hidden capitalize sm:inline-flex">
              {role}
            </Badge>
            <div className="ml-auto hidden flex-1 justify-end md:flex">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-2">
              <LiveStatus />
              <Button asChild variant="ghost" size="icon" className="relative size-11">
                <Link
                  href="/app/notifications"
                  aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ""}`}
                >
                  <Bell aria-hidden="true" />
                  {unreadNotificationCount > 0 ? (
                    <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <ThemeToggle />
              <form action={signOutAction} className="lg:hidden">
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Sign out"
                >
                  <LogOut aria-hidden="true" />
                </Button>
              </form>
            </div>
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[100rem] p-page" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
