"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveSupportGrantAction,
  type OperationActionState,
  requestSupportGrant,
} from "./actions";

const initialState: OperationActionState = { status: "idle" };

function Feedback({ state }: Readonly<{ state: OperationActionState }>) {
  return state.message ? (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className="text-sm text-muted-foreground"
    >
      {state.message}
    </p>
  ) : null;
}

export function OperationControls() {
  const [requestState, requestAction, requestPending] = useActionState(
    requestSupportGrant,
    initialState,
  );
  const [approvalState, approvalAction, approvalPending] = useActionState(
    approveSupportGrantAction,
    initialState,
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Request support access</CardTitle>
          <CardDescription>
            Creates a read-only grant for at most one hour. A different operator must approve it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={requestAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organizationId">Organization UUID</Label>
              <Input id="organizationId" name="organizationId" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticketReference">Ticket reference</Label>
              <Input id="ticketReference" name="ticketReference" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" name="reason" minLength={20} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duration in minutes</Label>
              <Input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={5}
                max={60}
                defaultValue={15}
                required
              />
            </div>
            <Button type="submit" disabled={requestPending}>
              {requestPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              Request grant
            </Button>
            <Feedback state={requestState} />
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Approve support access</CardTitle>
          <CardDescription>
            Self-approval, expired grants, and grants containing write scopes are rejected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={approvalAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="grantId">Grant UUID</Label>
              <Input id="grantId" name="grantId" required />
            </div>
            <Button type="submit" variant="secondary" disabled={approvalPending}>
              {approvalPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              Approve grant
            </Button>
            <Feedback state={approvalState} />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
