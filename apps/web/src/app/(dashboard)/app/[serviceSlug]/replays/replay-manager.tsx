"use client";

import type { ReplayCorpus, ReplayRun, RepositoryConnection } from "@hyrum/contracts";
import {
  CheckCircle2,
  Copy,
  GitCompareArrows,
  KeyRound,
  Play,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createReplayAction } from "./actions";

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function outcomeVariant(outcome: "block" | "warn" | "note" | "pass") {
  if (outcome === "block") return "destructive" as const;
  if (outcome === "pass") return "secondary" as const;
  return "outline" as const;
}

export function ReplayManager({
  serviceSlug,
  corpora,
  runs,
  canRun,
  recentlyAuthenticated,
  repositoryConnections,
}: Readonly<{
  serviceSlug: string;
  corpora: ReplayCorpus[];
  runs: ReplayRun[];
  canRun: boolean;
  recentlyAuthenticated: boolean;
  repositoryConnections: RepositoryConnection[];
}>) {
  const readyCorpora = corpora.filter(({ status }) => status === "ready");
  const [corpusId, setCorpusId] = useState(readyCorpora[0]?.id ?? "");
  const [baseDigest, setBaseDigest] = useState("");
  const [candidateDigest, setCandidateDigest] = useState("");
  const [repositoryConnectionId, setRepositoryConnectionId] = useState("manual");
  const [pullRequestNumber, setPullRequestNumber] = useState("");
  const [runnerBundle, setRunnerBundle] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {canRun ? (
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle>Start a deterministic replay</CardTitle>
            <CardDescription>
              Compare immutable images against the same corpus. Signing keys remain local.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readyCorpora.length === 0 ? (
              <Alert>
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>A ready corpus is required</AlertTitle>
                <AlertDescription>
                  Build a replay corpus after capture evidence is available.
                </AlertDescription>
              </Alert>
            ) : (
              <form
                className="grid gap-4 lg:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(undefined);
                  setRunnerBundle(undefined);
                  startTransition(async () => {
                    try {
                      const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
                        "sign",
                        "verify",
                      ]);
                      const [publicKey, privateKey] = await Promise.all([
                        crypto.subtle.exportKey("spki", keys.publicKey),
                        crypto.subtle.exportKey("pkcs8", keys.privateKey),
                      ]);
                      const result = await createReplayAction(serviceSlug, {
                        replayCorpusId: corpusId,
                        baseImageDigest: baseDigest,
                        candidateImageDigest: candidateDigest,
                        triggerIdempotencyKey: crypto.randomUUID(),
                        runnerVersion: "1.0.0",
                        reportSigningPublicKey: base64(publicKey),
                        signingKeyId: crypto.randomUUID(),
                        ...(repositoryConnectionId !== "manual"
                          ? {
                              repositoryConnectionId,
                              pullRequestNumber: Number(pullRequestNumber),
                            }
                          : {}),
                      });
                      setRunnerBundle(
                        JSON.stringify(
                          {
                            schemaVersion: 1,
                            replayRunId: result.run.id,
                            baseImageDigest: result.run.baseImageDigest,
                            candidateImageDigest: result.run.candidateImageDigest,
                            runnerVersion: result.run.runnerVersion,
                            ...result.runnerCredential,
                            reportSigningPrivateKey: base64(privateKey),
                          },
                          null,
                          2,
                        ),
                      );
                    } catch (caught) {
                      setError(
                        caught instanceof Error ? caught.message : "Could not create replay",
                      );
                    }
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="replay-corpus">Corpus version</Label>
                  <Select value={corpusId} onValueChange={setCorpusId}>
                    <SelectTrigger id="replay-corpus" className="w-full">
                      <SelectValue placeholder="Select a ready corpus" />
                    </SelectTrigger>
                    <SelectContent>
                      {readyCorpora.map((corpus) => (
                        <SelectItem key={corpus.id} value={corpus.id}>
                          Version {corpus.version} · {corpus.itemCount} requests
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="hidden lg:block" />
                {repositoryConnections.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="replay-repository">Change source</Label>
                      <Select
                        value={repositoryConnectionId}
                        onValueChange={setRepositoryConnectionId}
                      >
                        <SelectTrigger id="replay-repository" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual replay</SelectItem>
                          {repositoryConnections.map((connection) => (
                            <SelectItem key={connection.id} value={connection.id}>
                              {connection.ownerLogin}/{connection.repositoryName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pull-request-number">Pull request number</Label>
                      <Input
                        id="pull-request-number"
                        type="number"
                        min={1}
                        value={pullRequestNumber}
                        onChange={(event) => setPullRequestNumber(event.target.value)}
                        disabled={repositoryConnectionId === "manual"}
                        required={repositoryConnectionId !== "manual"}
                        placeholder="123"
                      />
                    </div>
                  </>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="base-image">Base image digest</Label>
                  <Input
                    id="base-image"
                    value={baseDigest}
                    onChange={(event) => setBaseDigest(event.target.value)}
                    pattern="sha256:[0-9a-f]{64}"
                    placeholder="sha256:…"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="candidate-image">Candidate image digest</Label>
                  <Input
                    id="candidate-image"
                    value={candidateDigest}
                    onChange={(event) => setCandidateDigest(event.target.value)}
                    pattern="sha256:[0-9a-f]{64}"
                    placeholder="sha256:…"
                    required
                  />
                </div>
                {!recentlyAuthenticated ? (
                  <p className="text-sm text-muted-foreground lg:col-span-2">
                    Re-authenticate before creating an immutable replay run.
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-sm text-destructive lg:col-span-2">
                    {error}
                  </p>
                ) : null}
                <div className="lg:col-span-2">
                  <Button disabled={pending || !recentlyAuthenticated}>
                    <Play aria-hidden="true" />
                    {pending ? "Preparing…" : "Prepare runner"}
                  </Button>
                </div>
              </form>
            )}
            {runnerBundle ? (
              <div className="mt-6 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 size-5 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-medium">One-time runner bundle</p>
                    <p className="text-sm text-muted-foreground">
                      Save this securely now. The private signing key and token are never shown
                      again.
                    </p>
                  </div>
                </div>
                <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                  <code>{runnerBundle}</code>
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(runnerBundle)}
                >
                  <Copy aria-hidden="true" />
                  Copy bundle
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Replay history</CardTitle>
          <CardDescription>
            Signed reports and stability outcomes for immutable comparisons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="py-10 text-center">
              <GitCompareArrows
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 font-medium">No replay runs yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="rounded-lg border p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{run.candidateImageDigest.slice(0, 22)}…</p>
                        <Badge variant={run.status === "succeeded" ? "secondary" : "outline"}>
                          {run.status}
                        </Badge>
                        {run.gateDecision ? (
                          <Badge variant={outcomeVariant(run.gateDecision.outcome)}>
                            Gate {run.gateDecision.outcome}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Base {run.baseImageDigest.slice(0, 22)}… ·{" "}
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(run.createdAt))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {run.gateDecision?.outcome === "block" ? (
                        <ShieldAlert
                          className="size-5 text-destructive"
                          aria-label="Gate blocked"
                        />
                      ) : run.status === "succeeded" ? (
                        <CheckCircle2
                          className="size-5 text-primary"
                          aria-label="Replay succeeded"
                        />
                      ) : null}
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/${serviceSlug}/replays/${run.id}`}>Review</Link>
                      </Button>
                    </div>
                  </div>
                  {run.gateDecision ? (
                    <details className="group mt-4 border-t pt-3">
                      <summary className="cursor-pointer text-sm font-medium marker:text-muted-foreground">
                        {run.gateDecision.blockingImpactCount} blocking ·{" "}
                        {run.gateDecision.warningImpactCount} warning ·{" "}
                        {run.gateDecision.notedImpactCount} noted
                      </summary>
                      {run.gateDecision.impacts.length ? (
                        <ul className="mt-3 space-y-2" aria-label="Gate impacts">
                          {run.gateDecision.impacts.map((impact) => (
                            <li
                              key={impact.id}
                              className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="font-medium">{impact.consumerAlias}</p>
                                <p className="text-xs text-muted-foreground">
                                  {impact.kind.replace("_", " ")} ·{" "}
                                  {impact.assertionId
                                    ? "active assertion"
                                    : impact.effectiveTier?.toUpperCase()}{" "}
                                  · {impact.stability}
                                </p>
                              </div>
                              <Badge variant={outcomeVariant(impact.action)}>{impact.action}</Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          No matched consumer impacts were found.
                        </p>
                      )}
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
