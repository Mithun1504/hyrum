import { AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TierBadge } from "@/components/workspace/tier-badge";
import { cn } from "@/lib/utils";
import type { LedgerRow } from "@/services/workspace-data";

export function PageIntro({
  title,
  desc,
  actions,
}: {
  title: string;
  desc: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 grid gap-4 border-b border-border pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}

export function DataStatusBanner({ errors }: { errors: string[] }) {
  return (
    <section
      className="mb-6 border border-destructive/40 bg-destructive/10 px-4 py-4"
      role="status"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="size-4" aria-hidden="true" />
        Control plane data is incomplete
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Live data could not be loaded in full. Check the control plane and retry this page.
      </p>
      <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
        {errors.slice(0, 3).map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </section>
  );
}

export function LedgerTable({
  rows,
  compact = false,
  selectedId,
}: {
  rows: LedgerRow[];
  compact?: boolean;
  selectedId?: string | null;
}) {
  return (
    <>
      <div className="grid gap-3 p-3 md:hidden">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={behaviorHref(row)}
            prefetch={false}
            className={cn(
              "grid gap-3 border border-border bg-card p-4 text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-secondary",
              selectedId === row.id && "border-tier-proof/60 bg-tier-proof/10",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <b className="block truncate font-semibold text-foreground">{row.endpoint}</b>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.consumer_alias}
                </span>
              </span>
              <TierBadge tier={row.tier} compact />
            </span>
            <span className="text-sm">{compact ? row.kind : row.title}</span>
            <span className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{row.kind}</span>
              <span>{row.observation_count} obs</span>
              <span>{sessionCount(row.session_count)}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-industrial-3 text-xs text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Behavior</th>
              <th className="px-4 py-3 font-semibold">Endpoint</th>
              <th className="px-4 py-3 font-semibold">Consumer</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
              <th className="px-4 py-3 font-semibold">Last seen</th>
              <th className="px-4 py-3 font-semibold">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border transition-colors hover:bg-secondary/40",
                  selectedId === row.id && "bg-tier-proof/10",
                )}
              >
                <td className="max-w-[280px] px-4 py-3">
                  <div className="font-medium text-foreground">
                    {compact ? row.kind : row.title}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{row.impact}</div>
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{row.endpoint}</td>
                <td className="px-4 py-3">
                  <div>{row.consumer_alias}</div>
                  <div className="text-xs text-muted-foreground">{row.consumer_stable_id}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <TierBadge tier={row.tier} compact />
                    <span className="text-xs text-muted-foreground">
                      {row.observation_count} obs · {sessionCount(row.session_count)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDate(row.last_seen_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={behaviorHref(row)}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center gap-1 rounded-[3px] border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-input"
                  >
                    {row.receipt_id ? "Receipt" : "Inspect"}
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function sessionCount(count: number) {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}

function behaviorHref(row: LedgerRow) {
  return `/app?view=behavior&entry=${encodeURIComponent(row.id)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SelectFilter({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {name}
      <select
        name={name}
        defaultValue={value}
        className="h-11 rounded-[4px] border border-input bg-background px-3 text-base font-normal text-foreground transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border p-4 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export function EmptyPanel({
  title,
  description = "No records are available in the current tenant snapshot.",
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center border border-border bg-card p-8 text-center">
      <div className="max-w-md">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
