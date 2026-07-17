import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getWorkspace } from "@/services/workspace";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { organizationId } = await withAuth({ ensureSignedIn: true });
  if (!organizationId) redirect("/app/select-organization");
  const { user, session, organization, services, notifications } = await getWorkspace();

  return (
    <AppShell
      organizationName={organization.name}
      organizationStatus={organization.status}
      role={session.role}
      permissions={session.permissions}
      userEmail={user.email}
      services={services}
      unreadNotificationCount={notifications.unreadCount}
    >
      {children}
    </AppShell>
  );
}
