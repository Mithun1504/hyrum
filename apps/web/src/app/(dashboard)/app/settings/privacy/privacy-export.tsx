"use client";

import type { DataSubjectRequest } from "@hyrum/contracts";
import { Download, LoaderCircle, ShieldCheck } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createExportDownload,
  type PrivacyActionState,
  requestOrganizationDeletion,
  requestOrganizationExport,
} from "./actions";

const initialState: PrivacyActionState = { status: "idle" };

export function PrivacyExport({
  requests,
  organizationName,
}: Readonly<{ requests: readonly DataSubjectRequest[]; organizationName: string }>) {
  const [state, action, pending] = useActionState(requestOrganizationExport, initialState);
  const [deletionState, deletionAction, deletionPending] = useActionState(
    requestOrganizationDeletion,
    initialState,
  );
  const [downloadState, setDownloadState] = useState<PrivacyActionState>(initialState);
  const [downloadPending, startDownload] = useTransition();
  const exportActive = requests.some(
    (request) =>
      request.requestType === "export" &&
      ["pending", "verified", "processing"].includes(request.status),
  );
  const deletionActive = requests.some(
    (request) =>
      request.requestType === "delete_organization" &&
      ["pending", "verified", "processing"].includes(request.status),
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden="true" />
            Workspace export
          </CardTitle>
          <CardDescription>
            Generate an allowlisted export of workspace configuration and product records. Traffic
            bodies, credentials, secrets, HMAC inputs, prompts, and signed URLs are always excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="export-confirmation">Type EXPORT to confirm</Label>
              <Input id="export-confirmation" name="confirmation" autoComplete="off" required />
            </div>
            <Button type="submit" disabled={pending || exportActive || deletionActive}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {exportActive ? "Export in progress" : "Create export"}
            </Button>
            {state.message ? (
              <p
                role={state.status === "error" ? "alert" : "status"}
                className="text-sm text-muted-foreground"
              >
                {state.message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request history</CardTitle>
          <CardDescription>Exports expire seven days after generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No privacy requests yet.</p>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">
                    {request.requestType.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {request.status} · {new Date(request.requestedAt).toLocaleString()}
                  </p>
                </div>
                {request.exportAvailable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloadPending}
                    onClick={() =>
                      startDownload(async () => {
                        const result = await createExportDownload(request.id);
                        setDownloadState(result);
                        if (result.downloadUrl) window.location.assign(result.downloadUrl);
                      })
                    }
                  >
                    <Download aria-hidden="true" />
                    Download
                  </Button>
                ) : null}
              </div>
            ))
          )}
          {downloadState.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {downloadState.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-destructive/40 xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-destructive">Delete workspace</CardTitle>
          <CardDescription>
            This permanently deletes object storage first, then relational tenant data. A
            secret-free digest remains in the platform audit trail. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={deletionAction} className="max-w-xl space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">Type DELETE {organizationName} to confirm</Label>
              <Input id="delete-confirmation" name="confirmation" autoComplete="off" required />
            </div>
            <Button
              type="submit"
              variant="destructive"
              disabled={deletionPending || deletionActive}
            >
              {deletionPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              {deletionActive ? "Deletion in progress" : "Permanently delete workspace"}
            </Button>
            {deletionState.message ? (
              <p
                role={deletionState.status === "error" ? "alert" : "status"}
                className="text-sm text-muted-foreground"
              >
                {deletionState.message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
