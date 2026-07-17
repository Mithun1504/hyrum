import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { getWorkspace } from "@/services/workspace";
import { MemberDirectoryView } from "./member-directory";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const [{ session }, directory] = await Promise.all([
    getWorkspace(),
    currentControlPlaneClient().then((client) => client.members()),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace settings"
        title="Members and permissions"
        description="Manage who can access this organization and the role boundaries applied by every API request."
      />
      <MemberDirectoryView
        directory={directory}
        currentMembershipId={session.membershipId}
        canInvite={session.permissions.includes("member:invite")}
        canManage={session.permissions.includes("member:manage")}
        isOwner={session.role === "owner"}
      />
    </div>
  );
}
