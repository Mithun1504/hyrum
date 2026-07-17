import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { PolicyEditor } from "./policy-editor";

export default async function GatePolicyPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  const [policy, session] = await Promise.all([client.gatePolicy(serviceSlug), client.session()]);
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Deterministic gate"
        title="Gate policy"
        description="Configure how persisted replay facts map to CI outcomes. The interface and database enforce evidence-tier safety invariants."
      />
      <PolicyEditor
        serviceSlug={serviceSlug}
        policy={policy}
        canManage={session.permissions.includes("policy:manage")}
        recentlyAuthenticated={session.recentlyAuthenticated}
      />
    </section>
  );
}
