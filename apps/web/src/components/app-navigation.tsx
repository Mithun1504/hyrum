"use client";

import type { ApiService } from "@hyrum/contracts";
import {
  BellRing,
  BookOpenText,
  Braces,
  Building2,
  ChartNoAxesCombined,
  DatabaseZap,
  FileJson2,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Pin,
  PlugZap,
  Plus,
  RadioTower,
  Settings2,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type ServiceSummary = Pick<ApiService, "id" | "name" | "slug" | "status">;

function useActiveService(services: readonly ServiceSummary[]) {
  const pathname = usePathname();
  return services.find((service) => pathname.startsWith(`/app/${service.slug}/`)) ?? services[0];
}

function NavigationLinks({
  services,
  onNavigate,
  canManageServices,
}: {
  services: readonly ServiceSummary[];
  onNavigate?: () => void;
  canManageServices: boolean;
}) {
  const pathname = usePathname();
  const activeService = useActiveService(services);
  const items = [
    ...(activeService
      ? [
          { href: `/app/${activeService.slug}/overview`, label: "Overview", icon: LayoutDashboard },
          {
            href: `/app/${activeService.slug}/specifications`,
            label: "Specification",
            icon: FileJson2,
          },
          { href: `/app/${activeService.slug}/agents`, label: "Capture agents", icon: RadioTower },
          { href: `/app/${activeService.slug}/ledger`, label: "Ledger", icon: BookOpenText },
          { href: `/app/${activeService.slug}/consumers`, label: "Consumers", icon: Users },
          { href: `/app/${activeService.slug}/endpoints`, label: "Endpoints", icon: Braces },
          { href: `/app/${activeService.slug}/assertions`, label: "Assertions", icon: Pin },
          {
            href: `/app/${activeService.slug}/corpora`,
            label: "Replay corpora",
            icon: DatabaseZap,
          },
          { href: `/app/${activeService.slug}/replays`, label: "Replays", icon: GitCompareArrows },
          {
            href: `/app/${activeService.slug}/reports`,
            label: "Reports",
            icon: ChartNoAxesCombined,
          },
          { href: `/app/${activeService.slug}/repository`, label: "Repository", icon: GitBranch },
          { href: `/app/${activeService.slug}/exceptions`, label: "Exceptions", icon: ShieldAlert },
          { href: `/app/${activeService.slug}/policy`, label: "Gate policy", icon: ShieldAlert },
        ]
      : []),
    { href: "/app/settings/members", label: "Members", icon: Users },
    { href: "/app/settings/organization", label: "Organization", icon: Settings2 },
    { href: "/app/settings/privacy", label: "Privacy", icon: LockKeyhole },
    { href: "/app/settings/notifications", label: "Notifications", icon: BellRing },
    { href: "/app/settings/integrations", label: "Integrations", icon: PlugZap },
    ...(canManageServices
      ? [{ href: "/app/onboarding/service", label: "Add service", icon: Plus }]
      : []),
  ];

  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ServiceSwitcher({
  services,
  canManageServices,
  onNavigate,
}: Readonly<{
  services: readonly ServiceSummary[];
  canManageServices: boolean;
  onNavigate?: () => void;
}>) {
  const router = useRouter();
  const activeService = useActiveService(services);

  if (services.length === 0) {
    if (!canManageServices) {
      return <p className="px-2 text-sm text-muted-foreground">No services configured</p>;
    }
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/app/onboarding">
          <Plus aria-hidden="true" />
          Add service
        </Link>
      </Button>
    );
  }

  return (
    <Select
      value={activeService?.slug}
      onValueChange={(slug) => {
        onNavigate?.();
        router.push(`/app/${slug}/overview`);
      }}
    >
      <SelectTrigger className="w-full min-w-0 sm:w-56" aria-label="Current API service">
        <SelectValue placeholder="Select a service" />
      </SelectTrigger>
      <SelectContent>
        {services.map((service) => (
          <SelectItem key={service.id} value={service.slug}>
            {service.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DesktopNavigation({
  services,
  canManageServices,
}: Readonly<{ services: readonly ServiceSummary[]; canManageServices: boolean }>) {
  return <NavigationLinks services={services} canManageServices={canManageServices} />;
}

export function MobileNavigation({
  services,
  canManageServices,
}: Readonly<{ services: readonly ServiceSummary[]; canManageServices: boolean }>) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[20rem] max-w-[88vw] p-0">
        <SheetHeader className="border-b p-5 text-left">
          <SheetTitle>
            <BrandMark />
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 p-4">
          <ServiceSwitcher
            services={services}
            canManageServices={canManageServices}
            onNavigate={() => setOpen(false)}
          />
          <Separator />
          <NavigationLinks
            services={services}
            canManageServices={canManageServices}
            onNavigate={() => setOpen(false)}
          />
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link href="/app/select-organization" onClick={() => setOpen(false)}>
              <Building2 aria-hidden="true" />
              Switch workspace
            </Link>
          </Button>
          {canManageServices ? (
            <Button asChild variant="ghost" className="w-full justify-start">
              <Link href="/app/onboarding/service" onClick={() => setOpen(false)}>
                <Settings2 aria-hidden="true" />
                Workspace setup
              </Link>
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
