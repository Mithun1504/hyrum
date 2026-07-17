"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type agentRegistrationDefaultsSchema,
  type CreateAgentRequest,
  createAgentRequestSchema,
} from "@hyrum/contracts";
import { Check, Clipboard, LoaderCircle, RadioTower, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAgentAction } from "./actions";

type RegistrationDefaults = z.infer<typeof agentRegistrationDefaultsSchema>;
type AgentRegistrationFormValues = z.input<typeof createAgentRequestSchema>;

export function AgentRegistrationForm({
  serviceSlug,
  defaults,
  controlPlaneUrl,
}: Readonly<{
  serviceSlug: string;
  defaults: RegistrationDefaults;
  controlPlaneUrl: string;
}>) {
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [credential, setCredential] = useState<{ token: string; expiresAt: string }>();
  const [copied, setCopied] = useState(false);
  const form = useForm<AgentRegistrationFormValues, unknown, CreateAgentRequest>({
    resolver: zodResolver(createAgentRequestSchema),
    defaultValues: {
      name: `${defaults.environmentName} capture`,
      environmentId: defaults.environmentId,
      externalInstanceKey: `${serviceSlug}-${defaults.environmentName.toLowerCase()}`,
      adapterType: "ndjson",
      agentVersion: defaults.extractorVersion,
      extractorReleaseId: defaults.extractorReleaseId,
      redactionPolicyVersionId: defaults.redactionPolicyVersionId,
      samplingPolicyVersionId: defaults.samplingPolicyVersionId,
      credentialExpiresInDays: 90,
    },
  });

  const submit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const result = await registerAgentAction(serviceSlug, values);
      if (result.ok) {
        setCredential(result.credential);
      } else {
        setError(result.message);
      }
    });
  });

  if (credential) {
    const command = `export HYRUM_AGENT_TOKEN='${credential.token}'\nexport HYRUM_SPOOL_ENCRYPTION_KEY='<base64-32-byte-key>'\nhyrum-agent --control-plane-url='${controlPlaneUrl}' --batch-id='<stable-batch-id>' --input=traffic.ndjson`;
    return (
      <div className="space-y-4">
        <Alert>
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Copy this credential now</AlertTitle>
          <AlertDescription>
            Hyrum stores only its Argon2id hash. This token cannot be shown again and expires on{" "}
            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
              new Date(credential.expiresAt),
            )}
            .
          </AlertDescription>
        </Alert>
        <pre className="max-h-64 overflow-auto rounded-lg border bg-muted p-4 font-mono text-xs leading-6">
          <code>{command}</code>
        </pre>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(command);
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          {copied ? "Copied" : "Copy installation command"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Registration failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent name</Label>
          <Input
            id="agent-name"
            {...form.register("name")}
            aria-invalid={Boolean(form.formState.errors.name)}
          />
          {form.formState.errors.name ? (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="instance-key">Instance key</Label>
          <Input
            id="instance-key"
            className="font-mono"
            {...form.register("externalInstanceKey")}
            aria-invalid={Boolean(form.formState.errors.externalInstanceKey)}
          />
          {form.formState.errors.externalInstanceKey ? (
            <p className="text-sm text-destructive">
              {form.formState.errors.externalInstanceKey.message}
            </p>
          ) : null}
        </div>
      </div>
      <div className="rounded-lg border bg-muted/50 p-4 text-sm">
        <p className="font-medium">Pinned capture configuration</p>
        <p className="mt-1 text-muted-foreground">
          Extractor {defaults.extractorVersion} · Redaction v{defaults.redactionPolicyVersion} ·
          Sampling v{defaults.samplingPolicyVersion}
        </p>
      </div>
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <RadioTower aria-hidden="true" />
        )}
        {submitting ? "Registering…" : "Register capture agent"}
      </Button>
    </form>
  );
}
