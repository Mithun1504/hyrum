"use client";

import type { GatePolicy, UpdateGatePolicy } from "@hyrum/contracts";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGatePolicyAction } from "./actions";

type Action = "block" | "warn" | "note" | "pass";

export function PolicyEditor({
  serviceSlug,
  policy,
  canManage,
  recentlyAuthenticated,
}: Readonly<{
  serviceSlug: string;
  policy: GatePolicy;
  canManage: boolean;
  recentlyAuthenticated: boolean;
}>) {
  const [form, setForm] = useState<UpdateGatePolicy>({
    t1Action: policy.t1Action,
    t2Action: policy.t2Action,
    t3Action: policy.t3Action,
    assertionAction: policy.assertionAction,
    flakyAction: policy.flakyAction,
    minimumStableAttempts: policy.minimumStableAttempts,
    expectedVersion: policy.version,
  });
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [pending, startTransition] = useTransition();
  const update = <K extends keyof UpdateGatePolicy>(key: K, value: UpdateGatePolicy[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>{policy.name}</CardTitle>
        <CardDescription>
          Version {policy.version} · activated{" "}
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(policy.activatedAt),
          )}
          . Policy versions are immutable once used by a replay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            setSuccess(undefined);
            startTransition(async () => {
              try {
                const next = await updateGatePolicyAction(serviceSlug, form);
                setForm((current) => ({ ...current, expectedVersion: next.version }));
                setSuccess(`Version ${next.version} activated.`);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Could not activate policy");
              }
            });
          }}
        >
          <PolicySelect
            id="policy-t1"
            label="T1 echo evidence"
            value={form.t1Action}
            options={["block", "warn", "note"]}
            onChange={(value) => update("t1Action", value as UpdateGatePolicy["t1Action"])}
            help="Only deterministically eligible T1 evidence may block."
          />
          <PolicySelect
            id="policy-t2"
            label="T2 pattern evidence"
            value={form.t2Action}
            options={["warn", "note", "pass"]}
            onChange={(value) => update("t2Action", value as UpdateGatePolicy["t2Action"])}
            help="T2 is suggestive and can never block."
          />
          <PolicySelect
            id="policy-t3"
            label="T3 exposure"
            value={form.t3Action}
            options={["note", "pass"]}
            onChange={(value) => update("t3Action", value as UpdateGatePolicy["t3Action"])}
            help="Exposure is informational and can never warn or block."
          />
          <PolicySelect
            id="policy-assertion"
            label="Pinned assertion"
            value={form.assertionAction}
            options={["block", "warn", "note"]}
            onChange={(value) =>
              update("assertionAction", value as UpdateGatePolicy["assertionAction"])
            }
            help="Assertions are explicit compatibility commitments."
          />
          <PolicySelect
            id="policy-flaky"
            label="Flaky replay delta"
            value={form.flakyAction}
            options={["warn", "note", "pass"]}
            onChange={(value) => update("flakyAction", value as UpdateGatePolicy["flakyAction"])}
            help="Unstable measurements can never block."
          />
          <div className="space-y-2">
            <Label htmlFor="stable-attempts">Minimum stable attempts</Label>
            <Input
              id="stable-attempts"
              type="number"
              min={2}
              max={10}
              value={form.minimumStableAttempts}
              onChange={(event) => update("minimumStableAttempts", Number(event.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Changed cases must agree across this many isolated attempts.
            </p>
          </div>
          {error ? (
            <p className="text-sm text-destructive md:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm text-primary md:col-span-2" role="status">
              {success}
            </p>
          ) : null}
          <div className="md:col-span-2">
            <Button disabled={!canManage || !recentlyAuthenticated || pending}>
              {pending ? "Activating…" : "Activate new version"}
            </Button>
            {canManage && !recentlyAuthenticated ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Re-authenticate before changing a gate policy.
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PolicySelect({
  id,
  label,
  value,
  options,
  onChange,
  help,
}: Readonly<{
  id: string;
  label: string;
  value: Action;
  options: Action[];
  onChange: (value: Action) => void;
  help: string;
}>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as Action)}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option[0]?.toUpperCase()}
            {option.slice(1)}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
