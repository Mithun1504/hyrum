"use client";

import type { ReplayImpactExplanation } from "@hyrum/contracts";
import { Bot, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestReplayImpactExplanationAction } from "../actions";

export function ImpactExplanation({
  serviceSlug,
  replayRunId,
  explanation,
  canRequest,
}: Readonly<{
  serviceSlug: string;
  replayRunId: string;
  explanation: ReplayImpactExplanation | null;
  canRequest: boolean;
}>) {
  const router = useRouter();
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!requested || explanation) return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    const stop = window.setTimeout(() => {
      window.clearInterval(timer);
      setRequested(false);
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [explanation, requested, router]);

  return (
    <Card className="border-primary/20 bg-primary/[0.025]">
      <CardHeader>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="text-primary" aria-hidden="true" /> AI-assisted explanation
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              GPT‑5.6 explains persisted replay facts. It cannot change deltas, evidence tiers, or
              the gate outcome.
            </CardDescription>
          </div>
          {explanation ? (
            <Badge variant="outline">{explanation.model}</Badge>
          ) : canRequest ? (
            <Button
              type="button"
              size="sm"
              disabled={pending || requested}
              onClick={() => {
                setError(undefined);
                startTransition(async () => {
                  try {
                    await requestReplayImpactExplanationAction(serviceSlug, replayRunId);
                    setRequested(true);
                    router.refresh();
                  } catch (caught) {
                    setError(
                      caught instanceof Error ? caught.message : "Could not request explanation",
                    );
                  }
                });
              }}
            >
              {pending || requested ? (
                <RefreshCw className="animate-spin" aria-hidden="true" />
              ) : (
                <Bot aria-hidden="true" />
              )}
              {pending || requested ? "Generating…" : "Explain impact"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Explanation unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {explanation ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={explanation.modelStatus === "succeeded" ? "secondary" : "outline"}>
                {explanation.modelStatus === "succeeded" ? "Model generated" : "Safe fallback"}
              </Badge>
              <Badge variant="outline">
                {Math.round(explanation.uncertainty * 100)}% uncertainty
              </Badge>
              {explanation.abstained ? <Badge variant="outline">Abstained</Badge> : null}
            </div>
            <div>
              <h3 className="font-semibold">{explanation.headline}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {explanation.summary}
              </p>
            </div>
            {explanation.abstentionReason ? (
              <Alert>
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Limited explanation</AlertTitle>
                <AlertDescription>{explanation.abstentionReason}</AlertDescription>
              </Alert>
            ) : null}
            {explanation.citations.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Validated citations</h4>
                <ul className="flex flex-wrap gap-2" aria-label="Validated AI citations">
                  {explanation.citations.map((citation) => (
                    <li key={`${citation.resourceType}:${citation.resourceId}`}>
                      <Badge className="font-mono text-xs" variant="outline">
                        {citation.resourceType.replace("_", " ")} ·{" "}
                        {citation.resourceId.slice(0, 8)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="border-t pt-3 text-xs text-muted-foreground">
              Prompt v{explanation.promptVersion} · Schema validated:{" "}
              {explanation.schemaValid === true ? "yes" : "fallback"} · Output digest:{" "}
              {explanation.outputDigest?.slice(0, 16) ?? "not available"}…
            </div>
          </>
        ) : requested ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            The worker is validating a cited, structured explanation. This page refreshes
            automatically.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {canRequest
              ? "Generate a plain-text explanation with cited deterministic evidence and explicit uncertainty."
              : "An engineer with replay permission can request an explanation."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
