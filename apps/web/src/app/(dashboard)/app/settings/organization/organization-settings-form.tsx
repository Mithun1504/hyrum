"use client";

import type { OrganizationSummary } from "@hyrum/contracts";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { type OrganizationActionState, saveOrganizationSettings, saveRetention } from "./actions";

const initialState: OrganizationActionState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

function Feedback({ state }: { state: OrganizationActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const Icon = state.status === "success" ? CheckCircle2 : AlertCircle;
  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"} aria-live="polite">
      <Icon aria-hidden="true" />
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function OrganizationSettingsForm({
  organization,
  canUpdate,
  isOwner,
}: {
  organization: OrganizationSummary;
  canUpdate: boolean;
  isOwner: boolean;
}) {
  const [settingsState, settingsAction] = useActionState(saveOrganizationSettings, initialState);
  const [retentionState, retentionAction] = useActionState(saveRetention, initialState);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace defaults</CardTitle>
          <CardDescription>
            These values apply to new evidence and assertions unless a service overrides them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={settingsAction} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization-name">Name</Label>
                <Input
                  id="organization-name"
                  name="name"
                  defaultValue={organization.name}
                  disabled={!canUpdate}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">IANA timezone</Label>
                <Input
                  id="timezone"
                  name="timezone"
                  defaultValue={organization.timezone}
                  disabled={!canUpdate}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stale-days">Evidence stale after</Label>
                <Input
                  id="stale-days"
                  name="staleAfterDays"
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={organization.staleAfterDays}
                  disabled={!canUpdate}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assertion-days">Default assertion duration</Label>
                <Input
                  id="assertion-days"
                  name="defaultAssertionDays"
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={organization.defaultAssertionDays}
                  disabled={!canUpdate}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt-days">Receipt TTL</Label>
                <Input
                  id="receipt-days"
                  name="defaultReceiptTtlDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={organization.defaultReceiptTtlDays}
                  disabled={!canUpdate}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="digest-enabled">Notification digest</Label>
                <Select
                  name="notificationDigestEnabled"
                  defaultValue={String(organization.notificationDigestEnabled)}
                  disabled={!canUpdate}
                >
                  <SelectTrigger id="digest-enabled" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exports-enabled">Data exports</Label>
                <Select
                  name="dataExportEnabled"
                  defaultValue={String(organization.dataExportEnabled)}
                  disabled={!canUpdate}
                >
                  <SelectTrigger id="exports-enabled" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canUpdate ? (
              <SaveButton />
            ) : (
              <p className="text-sm text-muted-foreground">
                Your role has read-only access to these settings.
              </p>
            )}
            <Feedback state={settingsState} />
          </form>
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Data retention</CardTitle>
            <CardDescription>
              Changing retention is owner-only and requires recent authentication. Receipt TTL
              cannot exceed retention.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={retentionAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full max-w-xs space-y-2">
                <Label htmlFor="retention-days">Retention days</Label>
                <Input
                  id="retention-days"
                  name="retentionDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={organization.retentionDays}
                  required
                />
              </div>
              <SaveButton />
            </form>
            <div className="mt-4">
              <Feedback state={retentionState} />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
