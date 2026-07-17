"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestReplayImpactExplanationAction } from "../actions";

export function AdvisoryControl({
  serviceSlug,
  replayRunId,
}: Readonly<{ serviceSlug: string; replayRunId: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!queued) return;
    let refreshes = 0;
    const interval = window.setInterval(() => {
      refreshes += 1;
      router.refresh();
      if (refreshes >= 15) window.clearInterval(interval);
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [queued, router]);

  function requestExplanation() {
    setError(null);
    startTransition(async () => {
      try {
        await requestReplayImpactExplanationAction(serviceSlug, replayRunId);
        setQueued(true);
        router.refresh();
      } catch {
        setError(
          "The explanation could not be queued. Deterministic replay results are unaffected.",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={requestExplanation} disabled={pending || queued}>
        <Sparkles aria-hidden="true" />
        {pending ? "Queuing…" : queued ? "Generating explanation…" : "Explain with GPT-5.6"}
      </Button>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {error ??
          (queued
            ? "This page will update when the advisory explanation is ready."
            : "Model output is advisory, citation-validated, and cannot change this gate.")}
      </p>
    </div>
  );
}
