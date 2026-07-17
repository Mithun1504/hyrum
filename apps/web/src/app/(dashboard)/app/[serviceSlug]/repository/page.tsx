import { GitBranch } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";
import { getWorkspace } from "@/services/workspace";
import { RepositoryForm } from "./repository-form";

export default async function RepositoryPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  const [workspace, data] = await Promise.all([
    getWorkspace(),
    client.repositoryConnections(serviceSlug),
  ]);
  const canManage = workspace.session.permissions.includes("integration:manage");
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Change gate"
        title="Repository connection"
        description="Map this API service to a synchronized GitHub repository, replay profile, and deterministic gate policy."
      />
      {data.connections.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.connections.map((connection) => (
            <Card key={connection.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-mono text-base">
                    {connection.ownerLogin}/{connection.repositoryName}
                  </CardTitle>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <CardDescription>{connection.specPath}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Workflow:</span> {connection.workflowPath}
                </p>
                <p>
                  <span className="text-muted-foreground">Build refs:</span>{" "}
                  {connection.baseImageBuildRef} → {connection.candidateImageBuildRef}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {canManage && data.repositories.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect a repository</CardTitle>
            <CardDescription>
              Paths are repository-relative and traversal-safe. The active profile and policy are
              captured at connection time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RepositoryForm serviceSlug={serviceSlug} repositories={data.repositories} />
          </CardContent>
        </Card>
      ) : data.repositories.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No synchronized repositories"
          description="Install and register the GitHub App, then select repository access in GitHub. Webhooks will populate this list."
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Admin access is required to connect repositories.
        </p>
      )}
    </section>
  );
}
