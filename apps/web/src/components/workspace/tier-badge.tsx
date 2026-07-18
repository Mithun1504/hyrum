import { CircleDotDashed, OctagonX, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EvidenceTier } from "@/services/workspace-data";

const tierCopy = {
  T1: {
    label: "T1 · echo",
    detail: "Echo evidence is eligible to block when the active policy maps it to a block.",
    className: "border-tier-proof/55 bg-tier-proof/10 text-tier-proof",
    icon: OctagonX,
  },
  T2: {
    label: "T2 · warns",
    detail: "Pattern evidence warns, but does not prove a dependency.",
    className: "border-tier-pattern/55 bg-tier-pattern/10 text-tier-pattern",
    icon: TriangleAlert,
  },
  T3: {
    label: "T3 · exposure",
    detail: "Exposure stays visible and never blocks the change gate.",
    className: "border-tier-exposure/55 bg-tier-exposure/10 text-tier-exposure",
    icon: CircleDotDashed,
  },
} satisfies Record<
  EvidenceTier,
  { label: string; detail: string; className: string; icon: typeof OctagonX }
>;

export function TierBadge({ tier, compact = false }: { tier: EvidenceTier; compact?: boolean }) {
  const copy = tierCopy[tier];
  const Icon = copy.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1.5 rounded-[3px] border px-1.5 font-mono text-[11px] font-semibold",
        copy.className,
      )}
    >
      <Icon aria-hidden="true" />
      <span>{compact ? tier : copy.label}</span>
    </Badge>
  );
}

export function TierLegend() {
  return (
    <div className="divide-y divide-border rounded-md border bg-card">
      {(Object.keys(tierCopy) as EvidenceTier[]).map((tier) => {
        const copy = tierCopy[tier];
        return (
          <div key={tier} className="grid gap-2 px-3 py-3 sm:grid-cols-[9rem_1fr] sm:items-center">
            <TierBadge tier={tier} />
            <p className="text-xs leading-5 text-muted-foreground">{copy.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: "pass" | "warn" | "block" }) {
  if (outcome === "block") {
    return (
      <Badge
        variant="outline"
        className="h-6 gap-1.5 rounded-[3px] border-tier-proof/55 bg-tier-proof/10 px-1.5 text-tier-proof"
      >
        <OctagonX aria-hidden="true" />
        Blocked
      </Badge>
    );
  }
  if (outcome === "warn") {
    return (
      <Badge
        variant="outline"
        className="h-6 gap-1.5 rounded-[3px] border-tier-pattern/55 bg-tier-pattern/10 px-1.5 text-tier-pattern"
      >
        <TriangleAlert aria-hidden="true" />
        Review warnings
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="h-6 gap-1.5 rounded-[3px] border-status-success/55 bg-status-success/10 px-1.5 text-status-success"
    >
      <ShieldCheck aria-hidden="true" />
      Passed
    </Badge>
  );
}
