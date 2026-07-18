import { AlertTriangle, Eye, Sparkles } from "lucide-react";
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
    <div className="mb-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          <Sparkles className="size-3" /> Evidence workspace
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{desc}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}

export function DataStatusBanner({ errors }: { errors: string[] }) {
  return (
    <section
      className="glass-panel mb-6 rounded-2xl border-destructive/40 bg-destructive/8 px-4 py-4"
      role="status"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="size-4" aria-hidden="true" />
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
              "motion-lift grid min-h-24 gap-2 rounded-xl border border-border bg-card p-4 text-xs",
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
      <div className="scrollbar-thin hidden overflow-x-auto md:block">
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
                  "border-b border-border/70 transition-colors hover:bg-secondary/55",
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
        "surface-grid mt-4 min-w-0 rounded-xl border border-input bg-industrial-3/80 p-4",
        compact && "mt-0",
      )}
    >
      <div className="mb-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <pre className="scrollbar-thin max-w-full overflow-auto whitespace-pre-wrap break-words text-[11px] leading-6 text-foreground">
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
        className="h-11 rounded-xl border border-input bg-background/75 px-3 text-xs normal-case tracking-normal text-foreground"
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
    <div className="glass-panel motion-lift min-w-0 rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className={cn("text-[10px] text-tier-proof", down && "text-destructive")}>{delta}</div>
    </div>
  );
}

export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 first:rounded-l-2xl last:rounded-r-2xl md:border-r md:last:border-r-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
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
    <div className="glass-panel grid min-h-64 place-items-center rounded-2xl p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
          <Eye className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold">{title}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
