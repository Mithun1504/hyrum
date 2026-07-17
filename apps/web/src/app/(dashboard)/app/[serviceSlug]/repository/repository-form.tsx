"use client";

import type { githubRepositorySchema } from "@hyrum/contracts";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRepositoryConnectionAction, type RepositoryActionState } from "./actions";

const initialState: RepositoryActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return <Button disabled={pending}>{pending ? "Connecting…" : "Connect repository"}</Button>;
}

export function RepositoryForm({
  serviceSlug,
  repositories,
}: Readonly<{
  serviceSlug: string;
  repositories: Array<z.infer<typeof githubRepositorySchema>>;
}>) {
  const [state, action] = useActionState(
    createRepositoryConnectionAction.bind(null, serviceSlug),
    initialState,
  );
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="github-repository">GitHub repository</Label>
          <Select name="githubRepositoryId" required>
            <SelectTrigger id="github-repository" className="w-full">
              <SelectValue placeholder="Select a synchronized repository" />
            </SelectTrigger>
            <SelectContent>
              {repositories.map((repository) => (
                <SelectItem key={repository.id} value={repository.id}>
                  {repository.ownerLogin}/{repository.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field id="spec-path" label="OpenAPI path" name="specPath" value="openapi.yaml" />
        <Field
          id="workflow-path"
          label="Workflow path"
          name="workflowPath"
          value=".github/workflows/hyrum.yml"
        />
        <Field
          id="base-build-ref"
          label="Base image build reference"
          name="baseImageBuildRef"
          value="base"
        />
        <Field
          id="candidate-build-ref"
          label="Candidate image build reference"
          name="candidateImageBuildRef"
          value="candidate"
        />
      </div>
      <Submit />
      {state.status !== "idle" && state.message ? (
        <Alert variant={state.status === "error" ? "destructive" : "default"} aria-live="polite">
          {state.status === "error" ? (
            <AlertCircle aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function Field({
  id,
  label,
  name,
  value,
}: Readonly<{ id: string; label: string; name: string; value: string }>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} defaultValue={value} required />
    </div>
  );
}
