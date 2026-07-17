"use client";

import { FileCheck2, LoaderCircle, UploadCloud } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadSpecificationAction } from "./actions";

export function SpecificationForm({ serviceSlug }: Readonly<{ serviceSlug: string }>) {
  const [versionLabel, setVersionLabel] = useState("");
  const [document, setDocument] = useState("");
  const [message, setMessage] = useState<
    { kind: "error"; text: string } | { kind: "success"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await uploadSpecificationAction(serviceSlug, { versionLabel, document });
          if (!result.ok) {
            setMessage({ kind: "error", text: result.message });
            return;
          }
          setMessage({
            kind: "success",
            text: result.created
              ? `Validated and activated ${result.operationCount} operations.`
              : `This exact specification is already active with ${result.operationCount} operations.`,
          });
        });
      }}
    >
      {message ? (
        <Alert variant={message.kind === "error" ? "destructive" : "default"} role="status">
          {message.kind === "success" ? <FileCheck2 aria-hidden="true" /> : null}
          <AlertTitle>
            {message.kind === "error" ? "Upload failed" : "Specification ready"}
          </AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="version-label">Version label</Label>
        <Input
          id="version-label"
          value={versionLabel}
          onChange={(event) => setVersionLabel(event.target.value)}
          placeholder="2026-07-15 or v1.4.0"
          maxLength={100}
          required
        />
        <p className="text-xs text-muted-foreground">A human-readable immutable version label.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="openapi-document">OpenAPI 3.x document</Label>
        <Textarea
          id="openapi-document"
          value={document}
          onChange={(event) => setDocument(event.target.value)}
          placeholder={'openapi: 3.1.0\ninfo:\n  title: Example API\n  version: "1.0"\npaths: {}'}
          className="min-h-80 font-mono text-xs leading-5"
          maxLength={2 * 1024 * 1024}
          spellCheck={false}
          required
        />
        <p className="text-xs text-muted-foreground">
          JSON or YAML up to 2 MB. Remote references are rejected; local references are supported.
        </p>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <UploadCloud aria-hidden="true" />
        )}
        {pending ? "Validating…" : "Validate and activate"}
      </Button>
    </form>
  );
}
