import { ControlPlaneError } from "@hyrum/api-client";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { ReplayManager } from "./replay-manager";

export default async function ReplaysPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  const promise = Promise.all([
    client.service(serviceSlug),
    client.corpora(serviceSlug),
    client.replays(serviceSlug),
    client.session(),
    client.repositoryConnections(serviceSlug),
  ]);
  let data: Awaited<typeof promise>;
  try {
    data = await promise;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }
  const [service, corpusWorkspace, replayList, session, repositories] = data;
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Differential verification"
        title={`${service.name} replays`}
        description="Run the same redacted requests against isolated base and candidate images, then inspect stable semantic changes."
      />
      <ReplayManager
        serviceSlug={serviceSlug}
        corpora={corpusWorkspace.corpora}
        runs={replayList.data}
        canRun={session.permissions.includes("replay:run")}
        recentlyAuthenticated={session.recentlyAuthenticated}
        repositoryConnections={repositories.connections}
      />
    </section>
  );
}
