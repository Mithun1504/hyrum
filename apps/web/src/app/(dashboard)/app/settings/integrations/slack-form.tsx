"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  configureSlackAction,
  type IntegrationActionState,
  startSlackOAuthAction,
} from "./actions";

const initialState: IntegrationActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return <Button disabled={pending}>{pending ? "Saving…" : "Save Slack routing"}</Button>;
}

export function SlackForm({
  installation,
  canManage,
}: Readonly<{
  installation: {
    teamId: string;
    teamName: string;
    channelId: string | null;
    status: string;
  } | null;
  canManage: boolean;
}>) {
  const [state, action] = useActionState(configureSlackAction, initialState);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Slack</CardTitle>
          {installation ? <Badge variant="secondary">{installation.status}</Badge> : null}
        </div>
        <CardDescription>
          Send gate and assertion summaries to one channel. Receipt bodies and secrets are never
          included.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <form
            action={startSlackOAuthAction}
            className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="slack-oauth-channel-id">Destination channel ID</Label>
              <Input
                id="slack-oauth-channel-id"
                name="channelId"
                defaultValue={installation?.channelId ?? ""}
                placeholder="C01234567"
                required
              />
            </div>
            <Button type="submit">Install with Slack</Button>
          </form>
        ) : null}
        <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          Environment-token fallback
          <span className="h-px flex-1 bg-border" />
        </div>
        <form action={action} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="slack-team-id">Workspace ID</Label>
              <Input
                id="slack-team-id"
                name="teamId"
                defaultValue={installation?.teamId}
                placeholder="T01234567"
                disabled={!canManage}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-team-name">Workspace name</Label>
              <Input
                id="slack-team-name"
                name="teamName"
                defaultValue={installation?.teamName}
                placeholder="Engineering"
                disabled={!canManage}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-channel-id">Channel ID</Label>
              <Input
                id="slack-channel-id"
                name="channelId"
                defaultValue={installation?.channelId ?? ""}
                placeholder="C01234567"
                disabled={!canManage}
                required
              />
            </div>
          </div>
          {canManage ? (
            <Submit />
          ) : (
            <p className="text-sm text-muted-foreground">
              Admin access is required to change integration routing.
            </p>
          )}
          {state.status !== "idle" && state.message ? (
            <Alert
              variant={state.status === "error" ? "destructive" : "default"}
              aria-live="polite"
            >
              {state.status === "error" ? (
                <AlertCircle aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
