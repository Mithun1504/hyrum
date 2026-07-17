import { ControlPlaneError } from "@hyrum/api-client";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { CorpusWorkspace } from "./corpus-workspace";

export default async function CorporaPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  const pageDataPromise = Promise.all([
    client.service(serviceSlug),
    client.corpora(serviceSlug),
    client.session(),
  ]);
  let pageData: Awaited<typeof pageDataPromise>;
  try {
    pageData = await pageDataPromise;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }
  const [service, workspace, session] = pageData;
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Replay inputs"
        title={`${service.name} corpora`}
        description="Inspect deterministic coverage, pinned assertion inclusion, and the safety boundary before differential replay."
      />
      <CorpusWorkspace
        serviceSlug={serviceSlug}
        profile={workspace.profile}
        corpora={workspace.corpora}
        canManage={session.permissions.includes("corpus:manage")}
        recentlyAuthenticated={session.recentlyAuthenticated}
      />
    </section>
  );
}
