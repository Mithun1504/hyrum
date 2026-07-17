import { ControlPlaneError } from "@hyrum/api-client";
import { RadioTower } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currentControlPlaneClient } from "@/services/control-plane";
import { AgentRegistrationForm } from "./agent-registration-form";

export default async function AgentsPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  const pageDataPromise = Promise.all([
    client.service(serviceSlug),
    client.agentRegistrationDefaults(serviceSlug),
    client.agents(serviceSlug),
    client.session(),
  ]);
  let pageData: Awaited<typeof pageDataPromise>;
  try {
    pageData = await pageDataPromise;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }
  const [service, defaults, agents, session] = pageData;
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Capture data plane"
        title={`${service.name} agents`}
        description="Install scoped capture processes, monitor their configuration revision, and verify the redacted ingestion connection."
      />
      <Card className="shadow-panel">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RadioTower className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Register an agent</CardTitle>
              <CardDescription>
                The plaintext credential is displayed once. Raw traffic never appears in this
                interface.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {session.permissions.includes("agent:manage") ? (
            <AgentRegistrationForm
              serviceSlug={serviceSlug}
              defaults={defaults}
              controlPlaneUrl={process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:4000"}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Your role can inspect agent health but cannot issue machine credentials.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connected agents</CardTitle>
          <CardDescription>
            Health changes when a signed heartbeat or redacted batch is accepted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agents.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No agents registered yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.data.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {agent.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{agent.agentVersion}</TableCell>
                    <TableCell>r{agent.configRevision}</TableCell>
                    <TableCell>
                      {agent.lastSeenAt
                        ? new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(agent.lastSeenAt))
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
