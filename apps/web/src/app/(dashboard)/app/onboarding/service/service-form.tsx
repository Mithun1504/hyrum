"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateServiceRequest, createServiceRequestSchema } from "@hyrum/contracts";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { createServiceAction } from "./actions";

const environmentKinds = ["production", "staging", "development", "demo"] as const;
type CreateServiceFormValues = z.input<typeof createServiceRequestSchema>;

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function ServiceForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm<CreateServiceFormValues, unknown, CreateServiceRequest>({
    resolver: zodResolver(createServiceRequestSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: null,
      environment: {
        name: "Production",
        slug: "production",
        kind: "production",
        baseUrlOrigin: null,
      },
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setSubmitting(true);
    setSubmitError(undefined);
    startTransition(async () => {
      const result = await createServiceAction(values);
      if (result.ok) {
        router.push(`/app/${result.serviceSlug}/overview`);
        router.refresh();
        return;
      }
      setSubmitError(result.message);
      setSubmitting(false);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {submitError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Service creation failed</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>
            <h2>Service identity</h2>
          </CardTitle>
          <CardDescription>
            This stable identity connects specifications, captured traffic, replay corpora, and
            gates.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="service-name">Service name</Label>
            <Input
              id="service-name"
              autoComplete="off"
              aria-invalid={Boolean(form.formState.errors.name)}
              aria-describedby={form.formState.errors.name ? "service-name-error" : undefined}
              {...form.register("name", {
                onChange: (event) => {
                  if (!form.formState.dirtyFields.slug) {
                    form.setValue("slug", slugify(event.target.value), { shouldValidate: true });
                  }
                },
              })}
            />
            {form.formState.errors.name ? (
              <p id="service-name-error" className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="service-slug">URL slug</Label>
            <Input
              id="service-slug"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(form.formState.errors.slug)}
              aria-describedby={
                form.formState.errors.slug ? "service-slug-error" : "service-slug-help"
              }
              {...form.register("slug")}
            />
            <p id="service-slug-help" className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens. This appears in workspace URLs.
            </p>
            {form.formState.errors.slug ? (
              <p id="service-slug-error" className="text-sm text-destructive">
                {form.formState.errors.slug.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="service-description">Description (optional)</Label>
            <Textarea
              id="service-description"
              rows={3}
              placeholder="What API surface does this service own?"
              {...form.register("description", {
                setValueAs: (value) => String(value ?? "").trim() || null,
              })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>
            <h2>Default environment</h2>
          </CardTitle>
          <CardDescription>
            Start with the environment whose external consumer behavior you need to protect.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="environment-name">Environment name</Label>
            <Input id="environment-name" {...form.register("environment.name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="environment-kind">Environment type</Label>
            <Controller
              control={form.control}
              name="environment.kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="environment-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {environmentKinds.map((kind) => (
                      <SelectItem key={kind} value={kind} className="capitalize">
                        {kind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="base-url">API origin (optional)</Label>
            <Input
              id="base-url"
              type="url"
              inputMode="url"
              placeholder="https://api.example.com"
              aria-invalid={Boolean(form.formState.errors.environment?.baseUrlOrigin)}
              {...form.register("environment.baseUrlOrigin", {
                setValueAs: (value) =>
                  String(value ?? "")
                    .trim()
                    .replace(/\/$/, "") || null,
              })}
            />
            {form.formState.errors.environment?.baseUrlOrigin ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.environment.baseUrlOrigin.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-status-success" aria-hidden="true" />
          Capture remains disabled until redaction and sampling policies are configured.
        </p>
        <Button type="submit" size="lg" disabled={submitting} className="sm:min-w-44">
          {submitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? "Creating service…" : "Create service"}
          {!submitting ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </div>
    </form>
  );
}
