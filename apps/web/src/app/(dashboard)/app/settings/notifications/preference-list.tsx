"use client";

import type { NotificationPreference } from "@hyrum/contracts";
import { AlertCircle, CheckCircle2, LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { type NotificationPreferenceActionState, saveNotificationPreference } from "./actions";

const initialState: NotificationPreferenceActionState = { status: "idle" };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function PreferenceCard({ preference }: { preference: NotificationPreference }) {
  const [state, action] = useActionState(saveNotificationPreference, initialState);
  const Icon = state.status === "success" ? CheckCircle2 : AlertCircle;
  const localMute = preference.mutedUntil
    ? new Date(preference.mutedUntil).toISOString().slice(0, 16)
    : "";
  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{preference.label}</CardTitle>
          {preference.mandatory ? (
            <Badge variant="secondary">
              <LockKeyhole aria-hidden="true" /> Mandatory
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          {preference.mandatory
            ? "Security and ownership notices cannot be muted or disabled."
            : `Controls ${preference.eventType} notices for your account.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-end">
          <input type="hidden" name="eventType" value={preference.eventType} />
          <div className="space-y-2">
            <Label htmlFor={`${preference.eventType}-in-app`}>In-app inbox</Label>
            <Select
              name="inAppEnabled"
              defaultValue={String(preference.inAppEnabled)}
              disabled={preference.mandatory}
            >
              <SelectTrigger id={`${preference.eventType}-in-app`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
            {preference.mandatory ? <input type="hidden" name="inAppEnabled" value="true" /> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${preference.eventType}-digest`}>Digest</Label>
            <Select
              name="digestEnabled"
              defaultValue={String(preference.digestEnabled)}
              disabled={preference.mandatory}
            >
              <SelectTrigger id={`${preference.eventType}-digest`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
            {preference.mandatory ? (
              <input type="hidden" name="digestEnabled" value="true" />
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${preference.eventType}-mute`}>Mute until</Label>
            <Input
              id={`${preference.eventType}-mute`}
              name="mutedUntil"
              type="datetime-local"
              defaultValue={localMute}
              disabled={preference.mandatory}
            />
          </div>
          <SubmitButton disabled={preference.mandatory} />
        </form>
        {state.status !== "idle" && state.message ? (
          <Alert
            className="mt-4"
            variant={state.status === "error" ? "destructive" : "default"}
            aria-live="polite"
          >
            <Icon aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PreferenceList({ preferences }: { preferences: NotificationPreference[] }) {
  return (
    <div className="space-y-4">
      {preferences.map((preference) => (
        <PreferenceCard key={preference.eventType} preference={preference} />
      ))}
    </div>
  );
}
