import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await withAuth({ ensureSignedIn: true });

  return children;
}
