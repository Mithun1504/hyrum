import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { getWorkspace } from "@/services/workspace";
import { SlackForm } from "./slack-form";

export default async function IntegrationsPage() {
  const [{ data: installation }, workspace] = await Promise.all([
    (await currentControlPlaneClient()).slackInstallation(),
    getWorkspace(),
  ]);
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Workspace settings"
        title="Integrations"
        description="Connect review surfaces while keeping Hyrum's deterministic ledger and gates authoritative."
      />
      <SlackForm
        installation={installation}
        canManage={workspace.session.permissions.includes("integration:manage")}
      />
    </section>
  );
}
