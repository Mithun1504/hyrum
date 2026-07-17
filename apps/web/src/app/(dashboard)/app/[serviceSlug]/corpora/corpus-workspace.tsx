"use client";

import type { ActiveReplayProfile, ReplayCorpus } from "@hyrum/contracts";
import { DatabaseZap, Download, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCorpusAction, corpusAccessAction } from "./actions";

export function CorpusWorkspace({
  serviceSlug,
  profile,
  corpora,
  canManage,
  recentlyAuthenticated,
}: Readonly<{
  serviceSlug: string;
  profile: ActiveReplayProfile;
  corpora: ReplayCorpus[];
  canManage: boolean;
  recentlyAuthenticated: boolean;
}>) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const current = corpora.find(({ status }) => status === "ready");
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <CardTitle>Coverage-curated corpus</CardTitle>
                <CardDescription>
                  One deterministic request per operation, consumer, and behavior class—plus every
                  active assertion.
                </CardDescription>
              </div>
              {canManage ? (
                <Button
                  disabled={pending || !recentlyAuthenticated}
                  onClick={() => {
                    setMessage(undefined);
                    startTransition(async () => {
                      try {
                        await buildCorpusAction(serviceSlug);
                        setMessage("Corpus build queued. Refresh after the worker completes it.");
                      } catch (error) {
                        setMessage(
                          error instanceof Error ? error.message : "Could not queue corpus build",
                        );
                      }
                    });
                  }}
                >
                  <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden="true" />
                  {pending ? "Queueing…" : current ? "Rebuild corpus" : "Build corpus"}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!recentlyAuthenticated && canManage ? (
              <p className="text-sm text-muted-foreground">
                Re-authenticate before changing replay inputs.
              </p>
            ) : null}
            {message ? (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            ) : null}
            {current ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Requests", current.itemCount],
                  ["Operations", current.operationCount],
                  ["Consumers", current.consumerCount],
                  ["Assertions", current.assertionCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/35 p-4">
                    <p className="text-2xl font-semibold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed py-10 text-center">
                <DatabaseZap className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 font-medium">No replay corpus yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Capture useful ledger evidence before building one.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{profile.name}</CardTitle>
            <CardDescription>Active replay safety profile · v{profile.version}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Operation mode</span>
              <Badge variant="secondary">{profile.allowedOperationMode.replaceAll("_", " ")}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Public egress</span>
              <Badge variant="outline">{profile.networkEgressEnabled ? "Enabled" : "Denied"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Request timeout</span>
              <span>{profile.requestTimeoutMs} ms</span>
            </div>
            <div className="flex items-center gap-2 border-t pt-3 text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Write requests require an explicit fixture.
            </div>
          </CardContent>
        </Card>
      </div>

      {current && current.fixtureRequiredCount > 0 && !profile.fixtureConfigured ? (
        <Alert>
          <LockKeyhole aria-hidden="true" />
          <AlertTitle>Write-path requests are quarantined</AlertTitle>
          <AlertDescription>
            {current.fixtureRequiredCount} request(s) require a disposable fixture and cannot run
            under this read-only profile.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Immutable versions</CardTitle>
          <CardDescription>
            Every build is digest-verified and retained independently until expiry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {corpora.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Versions appear here after the first successful build.
            </p>
          ) : (
            <div className="space-y-3">
              {corpora.map((corpus) => (
                <div
                  key={corpus.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Version {corpus.version}</p>
                      <Badge variant={corpus.status === "ready" ? "secondary" : "outline"}>
                        {corpus.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      sha256:{corpus.corpusDigest}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {corpus.itemCount} requests · expires{" "}
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(corpus.expiresAt),
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || corpus.status !== "ready"}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const access = await corpusAccessAction(corpus.id);
                          window.location.assign(access.url);
                        } catch (error) {
                          setMessage(
                            error instanceof Error ? error.message : "Could not open corpus",
                          );
                        }
                      })
                    }
                  >
                    <Download aria-hidden="true" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
