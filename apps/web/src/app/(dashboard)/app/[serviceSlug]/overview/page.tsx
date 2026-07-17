import { ControlPlaneError } from "@hyrum/api-client";
import type { ApiService, OnboardingProgress } from "@hyrum/contracts";
import { Activity, Check, FileJson2, RadioTower, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";

interface ServiceOverviewPageProps {
  params: Promise<{ serviceSlug: string }>;
}

const setupSteps = [
  {
    id: "specification",
    title: "Upload an OpenAPI specification",
    description: "Create the declared-contract baseline used to isolate accidental behavior.",
    icon: FileJson2,
  },
  {
    id: "capture",
    title: "Configure capture safeguards",
    description:
      "Review redaction and session sampling before any traffic leaves your environment.",
    icon: ShieldCheck,
  },
  {
    id: "first_traffic",
    title: "Connect the capture agent",
    description: "Install a scoped agent credential and verify the first redacted session batch.",
    icon: RadioTower,
  },
] as const;

export default async function ServiceOverviewPage({ params }: Readonly<ServiceOverviewPageProps>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  let service: ApiService;
  let onboarding: OnboardingProgress;
  try {
    [service, onboarding] = await Promise.all([
      client.service(serviceSlug),
      client.onboarding(serviceSlug),
    ]);
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Service overview"
        title={service.name}
        description="Build an evidence-backed ledger by connecting the declared specification and privacy-safe production capture."
        actions={<Badge className="capitalize">{service.status}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Environment</CardDescription>
            <CardTitle className="text-lg">{service.defaultEnvironment.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm capitalize text-muted-foreground">
              {service.defaultEnvironment.kind} · Capture{" "}
              {service.defaultEnvironment.captureEnabled ? "on" : "off"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>First capture</CardDescription>
            <CardTitle className="text-lg">
              {service.firstCaptureAt
                ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                    new Date(service.firstCaptureAt),
                  )
                : "Not connected"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {service.firstCaptureAt
                ? "Redacted traffic accepted."
                : "No traffic has been accepted."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Ledger status</CardDescription>
            <CardTitle className="text-lg">
              {service.firstUsefulLedgerAt ? "Evidence available" : "Waiting for setup"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {service.firstUsefulLedgerAt
                ? `First useful ledger ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(service.firstUsefulLedgerAt))}.`
                : "No evidence has been inferred."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-panel">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Complete service setup</CardTitle>
              <CardDescription>Each step verifies a real configured resource.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {setupSteps.map(({ id, title, description, icon: Icon }, index) => {
            const complete = onboarding.completedSteps.includes(id);
            return (
              <div
                key={title}
                className="flex items-start gap-4 rounded-lg border bg-background p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {complete ? (
                    <Check className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Icon className="size-4" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
                </div>
                <Badge
                  variant={complete ? "secondary" : "outline"}
                  className="hidden sm:inline-flex"
                >
                  {complete ? "Complete" : index + 1}
                </Badge>
              </div>
            );
          })}
          <div className="pt-2">
            <Button asChild size="lg">
              <Link href={`/app/${service.slug}/specifications`}>Upload specification</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
