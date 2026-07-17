"use client";

import type { Assertion, GeneratedDraft, LedgerEntry, OrganizationMember } from "@hyrum/contracts";
import { CalendarClock, Copy, FileCode2, Mail, Pin, RefreshCw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createAssertionAction,
  extendAssertionAction,
  requestAssertionSpecPatchAction,
  requestProductDraftAction,
  resolveAssertionAction,
  reviewProductDraftAction,
  scheduleBreakingChangeAction,
} from "./actions";

function localInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function AssertionManager({
  serviceSlug,
  assertions,
  ledger,
  members,
  currentMembershipId,
  canManage,
  recentlyAuthenticated,
  defaultExpiresAt,
  drafts,
}: Readonly<{
  serviceSlug: string;
  assertions: Assertion[];
  ledger: LedgerEntry[];
  members: OrganizationMember[];
  currentMembershipId: string;
  canManage: boolean;
  recentlyAuthenticated: boolean;
  defaultExpiresAt: string;
  drafts: Record<string, GeneratedDraft | null>;
}>) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [selectedLedgerId, setSelectedLedgerId] = useState(ledger[0]?.id ?? "");
  const [ownerMembershipId, setOwnerMembershipId] = useState(currentMembershipId);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"all_consumers" | "selected_consumers">("all_consumers");
  const [selectedConsumers, setSelectedConsumers] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const uniqueConsumers = useMemo(() => {
    const result = new Map<string, LedgerEntry["consumer"]>();
    for (const entry of ledger) result.set(entry.consumer.id, entry.consumer);
    return [...result.values()];
  }, [ledger]);
  const selectedEntry = ledger.find(({ id }) => id === selectedLedgerId);

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card className="shadow-panel">
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle>Pin a compatibility assertion</CardTitle>
                <CardDescription>
                  Assertions are mandatory replay cases with an owner and explicit expiry.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant={showCreate ? "ghost" : "default"}
                onClick={() => setShowCreate((value) => !value)}
              >
                <Pin aria-hidden="true" />
                {showCreate ? "Close" : "Pin behavior"}
              </Button>
            </div>
          </CardHeader>
          {showCreate ? (
            <CardContent>
              {ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The ledger needs an active behavior before it can be pinned.
                </p>
              ) : (
                <form
                  className="grid gap-4 lg:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!selectedEntry) return;
                    setError(undefined);
                    startTransition(async () => {
                      try {
                        await createAssertionAction(serviceSlug, {
                          behaviorDefinitionId: selectedEntry.behavior.id,
                          sourceClaimId: selectedEntry.dependencyClaimId,
                          ownerMembershipId,
                          reason,
                          scope,
                          consumerIds: scope === "selected_consumers" ? selectedConsumers : [],
                          expiresAt: new Date(expiresAt).toISOString(),
                        });
                        setShowCreate(false);
                        setReason("");
                      } catch (caught) {
                        setError(
                          caught instanceof Error ? caught.message : "Could not pin assertion",
                        );
                      }
                    });
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="assertion-behavior">Behavior</Label>
                    <select
                      id="assertion-behavior"
                      value={selectedLedgerId}
                      onChange={(event) => setSelectedLedgerId(event.target.value)}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      {ledger.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.behavior.label} · {entry.operation.method} {entry.operation.path}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assertion-owner">Owner</Label>
                    <select
                      id="assertion-owner"
                      value={ownerMembershipId}
                      onChange={(event) => setOwnerMembershipId(event.target.value)}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      {members
                        .filter(({ status }) => status === "active")
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName ?? member.email}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assertion-expiry">Expires</Label>
                    <Input
                      id="assertion-expiry"
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assertion-scope">Consumer scope</Label>
                    <select
                      id="assertion-scope"
                      value={scope}
                      onChange={(event) => {
                        const value = event.target.value as typeof scope;
                        setScope(value);
                        if (value === "all_consumers") setSelectedConsumers([]);
                      }}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="all_consumers">All consumers</option>
                      <option value="selected_consumers">Selected consumers</option>
                    </select>
                  </div>
                  {scope === "selected_consumers" ? (
                    <fieldset className="space-y-2 lg:col-span-2">
                      <legend className="text-sm font-medium">Consumers</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {uniqueConsumers.map((consumer) => (
                          <label
                            key={consumer.id}
                            className="flex items-center gap-2 rounded-md border p-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selectedConsumers.includes(consumer.id)}
                              onChange={(event) =>
                                setSelectedConsumers((values) =>
                                  event.target.checked
                                    ? [...values, consumer.id]
                                    : values.filter((id) => id !== consumer.id),
                                )
                              }
                            />
                            {consumer.displayAlias}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor="assertion-reason">Commitment reason</Label>
                    <Textarea
                      id="assertion-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      minLength={10}
                      maxLength={2000}
                      required
                      placeholder="Why must this behavior remain compatible, and what is the migration plan?"
                    />
                  </div>
                  {error ? <p className="text-sm text-destructive lg:col-span-2">{error}</p> : null}
                  <div className="lg:col-span-2">
                    <Button
                      disabled={
                        pending ||
                        (scope === "selected_consumers" && selectedConsumers.length === 0)
                      }
                    >
                      {pending ? "Pinning…" : "Pin assertion"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {assertions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No assertions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pin a ledger behavior to force it into every relevant replay.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {assertions.map((assertion) => (
            <AssertionCard
              key={assertion.id}
              assertion={assertion}
              serviceSlug={serviceSlug}
              canManage={canManage}
              recentlyAuthenticated={recentlyAuthenticated}
              drafts={drafts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssertionCard({
  assertion,
  serviceSlug,
  canManage,
  recentlyAuthenticated,
  drafts,
}: Readonly<{
  assertion: Assertion;
  serviceSlug: string;
  canManage: boolean;
  recentlyAuthenticated: boolean;
  drafts: Record<string, GeneratedDraft | null>;
}>) {
  const [mode, setMode] = useState<"extend" | "break" | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(localInput(new Date(assertion.expiresAt)));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const active = assertion.status === "active" || assertion.status === "expiring";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{assertion.behavior.label}</CardTitle>
            <CardDescription>
              {assertion.owner.displayName} · {assertion.scope.replaceAll("_", " ")}
            </CardDescription>
          </div>
          <Badge variant={active ? "secondary" : "outline"} className="capitalize">
            {assertion.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6">{assertion.reason}</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4" aria-hidden="true" />
          Expires{" "}
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(assertion.expiresAt),
          )}
        </div>
        {canManage && active ? (
          <div className="space-y-3 border-t pt-4">
            {!recentlyAuthenticated ? (
              <p className="text-xs text-muted-foreground">
                Re-authenticate to extend or schedule a deliberate break.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMode("extend");
                    setDate(
                      localInput(
                        new Date(new Date(assertion.expiresAt).getTime() + 30 * 86_400_000),
                      ),
                    );
                  }}
                >
                  Extend
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setMode("break");
                    setDate(
                      localInput(
                        new Date(
                          Math.min(
                            new Date(assertion.expiresAt).getTime() - 86_400_000,
                            Date.now() + 7 * 86_400_000,
                          ),
                        ),
                      ),
                    );
                  }}
                >
                  <ShieldAlert aria-hidden="true" />
                  Schedule break
                </Button>
              </div>
            )}
            {mode && recentlyAuthenticated ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(undefined);
                  startTransition(async () => {
                    try {
                      if (mode === "extend")
                        await extendAssertionAction(serviceSlug, assertion.id, {
                          expiresAt: new Date(date).toISOString(),
                          reason,
                          expectedUpdatedAt: assertion.updatedAt,
                        });
                      else
                        await scheduleBreakingChangeAction(serviceSlug, assertion.id, {
                          plannedFor: new Date(date).toISOString(),
                          reason,
                          expectedUpdatedAt: assertion.updatedAt,
                        });
                      setMode(null);
                      setReason("");
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Action failed");
                    }
                  });
                }}
              >
                <Label htmlFor={`assertion-date-${assertion.id}`}>
                  {mode === "extend" ? "New expiry" : "Planned break"}
                </Label>
                <Input
                  id={`assertion-date-${assertion.id}`}
                  type="datetime-local"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
                <Label htmlFor={`assertion-action-reason-${assertion.id}`}>Justification</Label>
                <Textarea
                  id={`assertion-action-reason-${assertion.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={10}
                  required
                />
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending}>
                    {pending ? "Saving…" : "Confirm"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
        {assertion.breakingChangePlan ? (
          <DraftWorkspace
            serviceSlug={serviceSlug}
            planId={assertion.breakingChangePlan.id}
            planStatus={assertion.breakingChangePlan.status}
            drafts={drafts}
            canManage={canManage}
            recentlyAuthenticated={recentlyAuthenticated}
          />
        ) : null}
        <AssertionDocumentation
          assertionId={assertion.id}
          serviceSlug={serviceSlug}
          draft={drafts[`${assertion.id}:spec_patch`] ?? null}
          canManage={canManage}
          recentlyAuthenticated={recentlyAuthenticated}
          expectedUpdatedAt={assertion.updatedAt}
        />
      </CardContent>
    </Card>
  );
}

function AssertionDocumentation({
  assertionId,
  serviceSlug,
  draft,
  canManage,
  recentlyAuthenticated,
  expectedUpdatedAt,
}: Readonly<{
  assertionId: string;
  serviceSlug: string;
  draft: GeneratedDraft | null;
  canManage: boolean;
  recentlyAuthenticated: boolean;
  expectedUpdatedAt: string;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Document this contract</p>
          <p className="text-xs text-muted-foreground">
            Generate an additive OpenAPI patch for human review.
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Refresh spec patch"
          onClick={() => router.refresh()}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>
      {draft?.content.draftType === "spec_patch" ? (
        <div className="space-y-3 rounded-lg border bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{draft.content.title}</span>
            <Badge variant="outline" className="capitalize">
              {draft.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{draft.content.rationale}</p>
          <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
            <code>{draft.content.patch}</code>
          </pre>
          <p className="text-xs text-muted-foreground">
            AI-assisted · {draft.citations.length} validated citation
            {draft.citations.length === 1 ? "" : "s"} · uncertainty{" "}
            {Math.round(draft.uncertainty * 100)}%
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard.writeText(
                  draft.content.draftType === "spec_patch" ? draft.content.patch : "",
                )
              }
            >
              <Copy aria-hidden="true" />
              Copy patch
            </Button>
            {canManage && recentlyAuthenticated && draft.status === "draft"
              ? (["accept", "reject"] as const).map((decision) => (
                  <Button
                    key={decision}
                    type="button"
                    size="sm"
                    variant={decision === "accept" ? "default" : "ghost"}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          setError(undefined);
                          await reviewProductDraftAction(serviceSlug, draft.id, decision);
                        } catch (caught) {
                          setError(
                            caught instanceof Error ? caught.message : "Draft review failed",
                          );
                        }
                      })
                    }
                  >
                    {decision === "accept" ? "Accept draft" : "Reject"}
                  </Button>
                ))
              : null}
            {canManage && recentlyAuthenticated && draft.status === "accepted" ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      setError(undefined);
                      await resolveAssertionAction(serviceSlug, assertionId, {
                        resolution: "documented",
                        reason: "Documented through the reviewed OpenAPI patch draft.",
                        expectedUpdatedAt,
                      });
                    } catch (caught) {
                      setError(
                        caught instanceof Error ? caught.message : "Could not resolve assertion",
                      );
                    }
                  })
                }
              >
                Mark documented
              </Button>
            ) : null}
          </div>
        </div>
      ) : canManage ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                setError(undefined);
                await requestAssertionSpecPatchAction(serviceSlug, assertionId);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Draft request failed");
              }
            })
          }
        >
          <FileCode2 aria-hidden="true" />
          Generate OpenAPI patch
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">No documentation draft has been generated.</p>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function DraftWorkspace({
  serviceSlug,
  planId,
  planStatus,
  drafts,
  canManage,
  recentlyAuthenticated,
}: Readonly<{
  serviceSlug: string;
  planId: string;
  planStatus: string;
  drafts: Record<string, GeneratedDraft | null>;
  canManage: boolean;
  recentlyAuthenticated: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">AI-assisted release drafts</p>
          <p className="text-xs text-muted-foreground">
            Advisory only · plan {planStatus.replaceAll("_", " ")}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Refresh drafts"
          onClick={() => router.refresh()}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>
      {(["customer_notice"] as Array<"spec_patch" | "customer_notice">).map((draftType) => {
        const draft = drafts[`${planId}:${draftType}`] ?? null;
        const label = draftType === "spec_patch" ? "OpenAPI patch" : "Customer notice";
        const Icon = draftType === "spec_patch" ? FileCode2 : Mail;
        return (
          <div key={draftType} className="rounded-lg border bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </div>
              {draft ? (
                <Badge variant="outline" className="capitalize">
                  {draft.status}
                </Badge>
              ) : null}
            </div>
            {draft ? (
              <div className="mt-3 space-y-3">
                {draft.abstained ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The model abstained: {draft.abstentionReason ?? "insufficient evidence"}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {draft.model} · uncertainty {Math.round(draft.uncertainty * 100)}% ·{" "}
                  {draft.citations.length} validated citation
                  {draft.citations.length === 1 ? "" : "s"}
                </p>
                {draft.content.draftType === "spec_patch" ? (
                  <>
                    <p className="text-sm font-medium">{draft.content.title}</p>
                    <p className="text-sm text-muted-foreground">{draft.content.rationale}</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                      <code>{draft.content.patch}</code>
                    </pre>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">{draft.content.subject}</p>
                    <p className="whitespace-pre-wrap text-sm">{draft.content.body}</p>
                    <p className="text-xs text-muted-foreground">
                      Audience: {draft.content.audienceSummary}
                    </p>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        draft.content.draftType === "spec_patch"
                          ? draft.content.patch
                          : `${draft.content.subject}\n\n${draft.content.body}`,
                      )
                    }
                  >
                    <Copy aria-hidden="true" />
                    Copy
                  </Button>
                  {canManage && draft.status === "draft" && recentlyAuthenticated
                    ? (["accept", "reject"] as const).map((decision) => (
                        <Button
                          key={decision}
                          type="button"
                          size="sm"
                          variant={decision === "accept" ? "default" : "ghost"}
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                setError(undefined);
                                await reviewProductDraftAction(serviceSlug, draft.id, decision);
                              } catch (caught) {
                                setError(
                                  caught instanceof Error ? caught.message : "Draft review failed",
                                );
                              }
                            })
                          }
                        >
                          {decision === "accept" ? "Accept draft" : "Reject"}
                        </Button>
                      ))
                    : null}
                </div>
              </div>
            ) : canManage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      setError(undefined);
                      await requestProductDraftAction(serviceSlug, planId, draftType);
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Draft request failed");
                    }
                  })
                }
              >
                Generate {label.toLowerCase()}
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No draft has been generated.</p>
            )}
          </div>
        );
      })}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
