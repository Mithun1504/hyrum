import { Eye } from "lucide-react";
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
    <div className="mb-6 grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-start">
      <h1 className="font-sans text-xl font-bold leading-tight md:text-2xl">{title}</h1>
      <p className="max-w-2xl text-xs leading-6 text-muted-foreground">{desc}</p>
      {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}

export function DataStatusBanner({ errors }: { errors: string[] }) {
  return (
    <section
      className="mb-6 border border-destructive/50 bg-destructive/10 px-4 py-3"
      role="status"
    >
      <h2 className="font-sans text-sm font-bold text-destructive">
        Control plane data is incomplete
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Live data could not be loaded in full. Check the control plane and retry this page.
      </p>
      <ul className="mt-2 text-[11px] text-muted-foreground">
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
              "grid min-h-20 gap-2 rounded-lg border border-border bg-industrial-3 p-4 text-xs transition-colors duration-150 ease-out hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selectedId === row.id && "border-tier-proof/60 bg-tier-proof/10",
            )}
          >
            <span className="flex items-center justify-between gap-3">
              <b className="text-tier-proof">{row.endpoint}</b>
              <TierBadge tier={row.tier} compact />
            </span>
            <span className="text-muted-foreground">{row.consumer_alias}</span>
            <span>{compact ? row.kind : row.title}</span>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-border text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-4 py-3 font-sans font-semibold">Endpoint × consumer</th>
              <th className="px-4 py-3 font-sans font-semibold">Behavior</th>
              <th className="px-4 py-3 font-sans font-semibold">Tier</th>
              <th className="px-4 py-3 font-sans font-semibold">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border/70 hover:bg-secondary/50",
                  selectedId === row.id && "bg-tier-proof/10",
                )}
              >
                <td className="px-4 py-3">
                  <Link
                    href={behaviorHref(row)}
                    prefetch={false}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <b className="text-tier-proof">{row.endpoint}</b>
                    <span className="text-muted-foreground"> · {row.consumer_alias}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">{compact ? row.kind : row.title}</td>
                <td className="px-4 py-3">
                  <TierBadge tier={row.tier} compact />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(row.last_seen_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function behaviorHref(row: LedgerRow) {
  return `/app?view=behavior&entry=${encodeURIComponent(row.id)}`;
}

export function CodeBlock({
  label,
  code,
  compact = false,
}: {
  label: string;
  code: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-4 min-w-0 rounded-lg border border-input bg-industrial-3 p-3",
        compact && "mt-0",
      )}
    >
      <div className="mb-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <pre className="max-w-full whitespace-pre-wrap break-words text-[11px] leading-6 text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
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
    <label className="grid gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
      {name}
      <select
        name={name}
        defaultValue={value}
        className="h-11 rounded-md border border-input bg-background px-3 text-xs normal-case tracking-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export function StatCard({
  label,
  value,
  delta,
  down = false,
}: {
  label: string;
  value: string;
  delta: string;
  down?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-sans text-2xl font-bold">{value}</div>
      <div className={cn("text-[10px] text-tier-proof", down && "text-destructive")}>{delta}</div>
    </div>
  );
}

export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-border p-4 md:border-b-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-sans text-xl font-bold">{value}</div>
    </div>
  );
}

export function MetricCell({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="border-b border-r border-border p-4 md:border-b-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-sans text-xl font-bold text-tier-proof",
          warn && "text-tier-pattern",
        )}
      >
        {(value * 100).toFixed(1)}%
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-input">
        <div
          className={cn(
            "h-full rounded-full bg-tier-proof",
            warn && "bg-tier-pattern",
            metricWidthClass(value),
          )}
        />
      </div>
    </div>
  );
}

function metricWidthClass(value: number) {
  if (value >= 0.99) return "w-[99%]";
  if (value >= 0.95) return "w-[96%]";
  if (value >= 0.9) return "w-[91%]";
  return "w-[88%]";
}

export function EmptyPanel({
  title,
  description = "Adjust filters or wait for the next capture batch.",
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="grid min-h-56 place-items-center p-8 text-center">
      <div>
        <Eye className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 font-sans text-base font-bold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
