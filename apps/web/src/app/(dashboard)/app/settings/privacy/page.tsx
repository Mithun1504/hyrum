import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { getWorkspace } from "@/services/workspace";
import { PrivacyExport } from "./privacy-export";

export const metadata: Metadata = { title: "Privacy and exports" };

export default async function PrivacyPage() {
  const { organization, session } = await getWorkspace();
  if (!session.permissions.includes("privacy:manage")) {
    return (
      <PageHeader
        eyebrow="Workspace settings"
        title="Privacy"
        description="Only workspace owners can manage exports and deletion requests."
      />
    );
  }
  const requests = await (await currentControlPlaneClient()).privacyRequests();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace settings"
        title="Privacy and exports"
        description="Auditable, owner-controlled data workflows with recent authentication required for every action."
      />
      <PrivacyExport requests={requests.data} organizationName={organization.name} />
    </div>
  );
}
