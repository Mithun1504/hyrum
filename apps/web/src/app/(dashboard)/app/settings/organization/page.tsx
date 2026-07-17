import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getWorkspace } from "@/services/workspace";
import { OrganizationSettingsForm } from "./organization-settings-form";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrganizationSettingsPage() {
  const { organization, session } = await getWorkspace();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace settings"
        title="Organization"
        description="Configure evidence lifecycle defaults, notifications, exports, and owner-controlled retention."
      />
      <OrganizationSettingsForm
        organization={organization}
        canUpdate={session.permissions.includes("organization:update")}
        isOwner={session.role === "owner"}
      />
    </div>
  );
}
