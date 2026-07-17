import { Check, Circle, FileJson2, RadioTower, ServerCog } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";
import { getWorkspace } from "@/services/workspace";

export const metadata: Metadata = { title: "Workspace setup" };

const steps = [
  { id: "service_and_environment", label: "Service and environment", icon: ServerCog },
  { id: "specification", label: "OpenAPI specification", icon: FileJson2 },
  { id: "capture", label: "Privacy-safe capture", icon: RadioTower },
] as const;

export default async function OnboardingPage() {
  const { services, session } = await getWorkspace();
  const client = await currentControlPlaneClient();
  const progress = await Promise.all(
    services.map(async (service) => ({ service, progress: await client.onboarding(service.id) })),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Resumable setup"
        title="Workspace onboarding"
        description="Each milestone is persisted after the corresponding backend resource is verified. You can leave and resume safely."
        actions={
          session.permissions.includes("service:manage") ? (
            <Button asChild>
              <Link href="/app/onboarding/service">Add service</Link>
            </Button>
          ) : undefined
        }
      />
      {progress.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No services yet</CardTitle>
            <CardDescription>
              Create the first API service and its default environment to begin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {session.permissions.includes("service:manage") ? (
              <Button asChild>
                <Link href="/app/onboarding/service">Create a service</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask an owner or admin to create the first service.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {progress.map(({ service, progress: serviceProgress }) => (
            <Card key={service.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{service.name}</CardTitle>
                  <Badge variant="outline" className="capitalize">
                    {service.status}
                  </Badge>
                </div>
                <CardDescription>
                  Current milestone: {serviceProgress.currentStep.replaceAll("_", " ")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-3">
                  {steps.map(({ id, label, icon: Icon }) => {
                    const complete = serviceProgress.completedSteps.includes(id);
                    const current = serviceProgress.currentStep === id;
                    return (
                      <li key={id} className="flex items-center gap-3">
                        <span
                          className={
                            complete
                              ? "flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                              : "flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
                          }
                        >
                          {complete ? (
                            <Check className="size-4" aria-hidden="true" />
                          ) : current ? (
                            <Icon className="size-4" aria-hidden="true" />
                          ) : (
                            <Circle className="size-3" aria-hidden="true" />
                          )}
                        </span>
                        <span className={current ? "font-medium" : "text-muted-foreground"}>
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <Button asChild variant="outline">
                  <Link
                    href={
                      serviceProgress.currentStep === "specification"
                        ? `/app/${service.slug}/specifications`
                        : `/app/${service.slug}/overview`
                    }
                  >
                    Continue setup
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
