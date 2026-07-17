"use client";

import type { TierProposal } from "@hyrum/contracts";
import { Bot, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestTierProposalAction } from "./actions";

export function TierProposalControl({
  serviceSlug,
  claimId,
  currentTier,
  proposal,
}: Readonly<{
  serviceSlug: string;
  claimId: string;
  currentTier: "t1" | "t2" | "t3";
  proposal: TierProposal | null;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [queued, setQueued] = useState(false);
  if (!proposal) {
    return (
      <div className="mt-2">
        {queued ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => router.refresh()}>
            <RefreshCw aria-hidden="true" /> Queued · refresh
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  setError(undefined);
                  await requestTierProposalAction(serviceSlug, claimId);
                  setQueued(true);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Tier proposal failed");
                }
              })
            }
          >
            <Bot aria-hidden="true" /> {pending ? "Requesting…" : "Suggest tier"}
          </Button>
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
      <div className="flex items-center gap-2">
        <Badge variant="outline">AI-assisted</Badge>
        <span>
          Proposes <strong className="uppercase">{proposal.proposedTier}</strong>
          {proposal.proposedTier === currentTier ? " · matches current tier" : " · review required"}
        </span>
      </div>
      <p className="text-muted-foreground">
        {proposal.model}
        {proposal.confidence
          ? ` · confidence ${Math.round(Number(proposal.confidence) * 100)}%`
          : ""}
      </p>
      {proposal.abstentionReason ? (
        <p className="text-amber-700 dark:text-amber-300">Abstained: {proposal.abstentionReason}</p>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={() => router.refresh()}>
        <RefreshCw aria-hidden="true" /> Refresh
      </Button>
    </div>
  );
}
