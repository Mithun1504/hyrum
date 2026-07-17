import { AlertTriangle, Ban, Eye, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EvidenceTier } from "@/services/workspace-data";

const tierCopy = {
  T1: {
    label: "T1 blocks",
    detail: "echo evidence",
    className: "border-tier-proof/40 bg-tier-proof/15 text-tier-proof",
    icon: Ban,
  },
  T2: {
    label: "T2 warns",
    detail: "pattern evidence",
    className: "border-tier-pattern/40 bg-tier-pattern/15 text-tier-pattern",
    icon: AlertTriangle,
  },
  T3: {
    label: "T3 exposure",
    detail: "never dependency",
    className: "border-tier-exposure/40 bg-tier-exposure/15 text-tier-exposure",
    icon: Eye,
  },
} satisfies Record<
  EvidenceTier,
  { label: string; detail: string; className: string; icon: typeof Ban }
>;

export function TierBadge({ tier, compact = false }: { tier: EvidenceTier; compact?: boolean }) {
  const copy = tierCopy[tier];
  const Icon = copy.icon;

  return (
    <Badge variant="outline" className={cn("gap-1 border", copy.className)}>
      <Icon aria-hidden="true" />
      <span>{compact ? tier : copy.label}</span>
    </Badge>
  );
}

export function TierLegend() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {(Object.keys(tierCopy) as EvidenceTier[]).map((tier) => {
        const copy = tierCopy[tier];
        const Icon = copy.icon;
        return (
          <div
            key={tier}
            className={cn("rounded-lg border p-3 text-sm ring-1 ring-foreground/5", copy.className)}
          >
            <div className="flex items-center gap-2 font-medium">
              <Icon className="size-4" aria-hidden="true" />
              {copy.label}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{copy.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: "pass" | "warn" | "block" }) {
  if (outcome === "block") {
    return (
      <Badge variant="destructive" className="gap-1">
        <Ban aria-hidden="true" />
        Blocking
      </Badge>
    );
  }
  if (outcome === "warn") {
    return (
      <Badge variant="outline" className="gap-1 border-tier-pattern/40 text-tier-pattern">
        <AlertTriangle aria-hidden="true" />
        Warning
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-tier-proof/40 text-tier-proof">
      <ShieldCheck aria-hidden="true" />
      Passing
    </Badge>
  );
}
