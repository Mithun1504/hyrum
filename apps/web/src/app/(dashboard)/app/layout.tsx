import { dashboardAuth } from "@/services/dashboard-auth";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await dashboardAuth();

  return children;
}
