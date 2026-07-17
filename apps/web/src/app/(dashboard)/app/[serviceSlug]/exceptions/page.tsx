import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";
import { ApproveExceptionControl } from "./exception-controls";

export default async function GateExceptionsPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  const [{ data }, session] = await Promise.all([
    client.gateExceptions(serviceSlug),
    client.session(),
  ]);
  const canApprove =
    session.permissions.includes("gate:exception:approve") && session.recentlyAuthenticated;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Controlled risk"
        title="Gate exceptions"
        description="Single-use, exact-candidate approvals for scheduled compatibility breaks. Exceptions never change evidence or the default policy."
      />
      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">No exception requests</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A request starts from a blocking assertion impact on a replay result.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.map((exception) => (
            <Card key={exception.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{exception.behaviorLabel}</CardTitle>
                    <CardDescription className="mt-1 font-mono text-xs">
                      {exception.candidateImageDigest}
                    </CardDescription>
                  </div>
                  <Badge variant={exception.status === "approved" ? "secondary" : "outline"}>
                    {exception.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6">{exception.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Valid until{" "}
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(exception.validUntil))}
                </p>
                {exception.status === "approved" ? (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    Rerun the same candidate to consume this approval. Any image or behavior change
                    requires a new request.
                  </p>
                ) : null}
                <ApproveExceptionControl
                  serviceSlug={serviceSlug}
                  exception={exception}
                  canApprove={
                    canApprove && exception.requestedByMembershipId !== session.membershipId
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
