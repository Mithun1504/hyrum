import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";
import { OperationControls } from "./operation-controls";

export const metadata: Metadata = { title: "Internal operations" };
export const dynamic = "force-dynamic";

export default async function InternalOperationsPage() {
  if (process.env.INTERNAL_OPERATIONS_ENABLED !== "true") notFound();
  const health = await (await currentControlPlaneClient()).platformHealth();
  const metrics = [
    ["Pending jobs", health.jobs.pending],
    ["Running jobs", health.jobs.running],
    ["Dead jobs", health.jobs.dead],
    ["Deleting workspaces", health.deletingOrganizations],
  ] as const;
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-8 px-5 py-8 sm:px-8">
      <PageHeader
        eyebrow="Restricted operations"
        title="Platform operations"
        description="Private, capability-gated controls. Tenant access is temporary, read-only, dual-approved, and fully audited."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        {metrics.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
      <OperationControls />
    </main>
  );
}
