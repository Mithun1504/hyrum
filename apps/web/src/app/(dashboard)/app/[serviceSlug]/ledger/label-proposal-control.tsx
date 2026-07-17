"use client";

import type { BehaviorLabelProposal } from "@hyrum/contracts";
import { Bot, Check, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestBehaviorLabelAction, reviewBehaviorLabelAction } from "./actions";

export function LabelProposalControl({
  serviceSlug,
  behaviorId,
  proposal,
  recentlyAuthenticated,
}: Readonly<{
  serviceSlug: string;
  behaviorId: string;
  proposal: BehaviorLabelProposal | null;
  recentlyAuthenticated: boolean;
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
                  await requestBehaviorLabelAction(serviceSlug, behaviorId);
                  setQueued(true);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Label request failed");
                }
              })
            }
          >
            <Bot aria-hidden="true" />
            {pending ? "Requesting…" : "Suggest label"}
          </Button>
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">AI-assisted</Badge>
        <span className="font-medium">{proposal.label}</span>
        <span className="text-muted-foreground">{proposal.model}</span>
      </div>
      {proposal.description ? (
        <p className="text-muted-foreground">{proposal.description}</p>
      ) : null}
      {proposal.abstentionReason ? (
        <p className="text-amber-700 dark:text-amber-300">Abstained: {proposal.abstentionReason}</p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {proposal.status === "proposed" && recentlyAuthenticated ? (
          (["accept", "reject"] as const).map((decision) => (
            <Button
              key={decision}
              type="button"
              size="sm"
              variant={decision === "accept" ? "default" : "ghost"}
              disabled={pending || Boolean(proposal.abstentionReason)}
              onClick={() =>
                startTransition(async () => {
                  try {
                    setError(undefined);
                    await reviewBehaviorLabelAction(serviceSlug, proposal.id, decision);
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Label review failed");
                  }
                })
              }
            >
              {decision === "accept" ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
              {decision === "accept" ? "Use label" : "Reject"}
            </Button>
          ))
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => router.refresh()}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}
