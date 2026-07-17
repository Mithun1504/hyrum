import { ControlPlaneError } from "@hyrum/api-client";
import { ArrowLeft, CircleAlert, GitCompareArrows, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";
import { RequestExceptionControl } from "../../exceptions/exception-controls";
import { AdvisoryControl } from "./advisory-control";
import { ImpactExplanation } from "./impact-explanation";

function json(value: Record<string, unknown> | null): string {
  return value ? JSON.stringify(value, null, 2) : "No structural value recorded";
}

export default async function ReplayDetailPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string; replayRunId: string }> }>) {
  const { serviceSlug, replayRunId } = await params;
  const client = await currentControlPlaneClient();
  const promise = Promise.all([
    client.replay(serviceSlug, replayRunId),
    client.replayImpactExplanation(serviceSlug, replayRunId),
    client.session(),
  ]);
  let data: Awaited<typeof promise>;
  try {
    data = await promise;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }
  const [detail, explanationResponse, session] = data;
  const { data: explanation } = explanationResponse;
  const decision = detail.gateDecision;
  const impactsByDelta = new Map<string, typeof detail.impacts>();
  for (const impact of detail.impacts) {
    impactsByDelta.set(impact.replayDeltaId, [
      ...(impactsByDelta.get(impact.replayDeltaId) ?? []),
      impact,
    ]);
  }

  return (
    <section className="space-y-8">
      <Button asChild size="sm" variant="ghost">
        <Link href={`/app/${serviceSlug}/replays`}>
          <ArrowLeft aria-hidden="true" /> Replays
        </Link>
      </Button>
      <PageHeader
        eyebrow="Signed differential result"
        title={decision ? `Gate ${decision.outcome}` : `Replay ${detail.run.status}`}
        description="Deterministic changes and affected consumers from immutable replay inputs. AI output cannot alter this decision."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Outcome">
          <Badge variant={decision?.outcome === "block" ? "destructive" : "secondary"}>
            {decision?.outcome ?? detail.run.status}
          </Badge>
        </Metric>
        <Metric label="Blocking impacts" value={decision?.blockingImpactCount ?? 0} />
        <Metric label="Warnings" value={decision?.warningImpactCount ?? 0} />
        <Metric
          label="Stable changes"
          value={detail.deltas.filter(({ stability }) => stability === "stable").length}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" /> Decision provenance
          </CardTitle>
          <CardDescription>
            Policy engine and immutable image inputs used for this result.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2">
          <Datum label="Base image" value={detail.run.baseImageDigest} mono />
          <Datum label="Candidate image" value={detail.run.candidateImageDigest} mono />
          <Datum label="Decision engine" value={decision?.engineVersion ?? "Awaiting report"} />
          <Datum label="Decision digest" value={decision?.decisionDigest ?? "—"} mono />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles aria-hidden="true" /> Advisory explanation
          </CardTitle>
          <CardDescription>
            GPT-5.6 can summarize the persisted facts, but cannot create evidence or alter the gate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {explanation ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">AI-assisted</Badge>
                <Badge variant="outline">{explanation.model}</Badge>
                {explanation.abstained ? <Badge variant="outline">Fallback</Badge> : null}
              </div>
              <div>
                <h3 className="font-semibold">{explanation.headline}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {explanation.summary}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Uncertainty {Math.round(explanation.uncertainty * 100)}% · Structured output{" "}
                {explanation.schemaValid ? "validated" : "fallback used"}
              </p>
            </div>
          ) : detail.deltas.length > 0 && detail.run.status === "succeeded" ? (
            <AdvisoryControl serviceSlug={serviceSlug} replayRunId={replayRunId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              An explanation becomes available after a replay completes with behavior changes.
            </p>
          )}
        </CardContent>
      </Card>

      <ImpactExplanation
        serviceSlug={serviceSlug}
        replayRunId={replayRunId}
        explanation={explanationResponse.data}
        canRequest={session.permissions.includes("replay:run") && detail.deltas.length > 0}
      />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Behavior changes</h2>
        {detail.deltas.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <GitCompareArrows
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 font-medium">No semantic differences detected</p>
            </CardContent>
          </Card>
        ) : (
          detail.deltas.map((delta) => {
            const impacts = impactsByDelta.get(delta.id) ?? [];
            return (
              <Card key={delta.id}>
                <CardHeader>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <CardTitle className="font-mono text-base">
                        {delta.operation.method} {delta.operation.path}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {delta.kind.replace("_", " ")} · {delta.agreeingAttempts}/
                        {delta.totalAttempts} attempts agreed
                      </CardDescription>
                    </div>
                    <Badge variant={delta.stability === "stable" ? "secondary" : "outline"}>
                      {delta.stability}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {impacts.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {impacts.map((impact) => (
                        <div key={impact.id} className="rounded-lg border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{impact.consumer.alias}</p>
                            <Badge variant={impact.action === "block" ? "destructive" : "outline"}>
                              {impact.action}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {impact.reasonCode.replaceAll("_", " ")}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="secondary">
                              {impact.effectiveTier?.toUpperCase() ?? "Assertion"}
                            </Badge>
                            {impact.exceptionApplied ? (
                              <Badge variant="outline">Approved exception</Badge>
                            ) : null}
                          </div>
                          {impact.action === "block" &&
                          impact.assertionId &&
                          session.permissions.includes("gate:exception:request") &&
                          session.recentlyAuthenticated ? (
                            <RequestExceptionControl
                              serviceSlug={serviceSlug}
                              gateImpactId={impact.id}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                      No active claim or assertion matched this structural change.
                    </div>
                  )}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <Structure title="Base structure" value={delta.normalizedBefore} />
                    <Structure title="Candidate structure" value={delta.normalizedAfter} />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  children,
}: Readonly<{ label: string; value?: number; children?: ReactNode }>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className={value === undefined ? "" : "text-2xl font-semibold"}>
        {children ?? value}
      </CardContent>
    </Card>
  );
}

function Datum({
  label,
  value,
  mono = false,
}: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`break-all ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Structure({
  title,
  value,
}: Readonly<{ title: string; value: Record<string, unknown> | null }>) {
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <pre className="mt-3 max-h-80 overflow-auto text-xs">
        <code>{json(value)}</code>
      </pre>
    </details>
  );
}
