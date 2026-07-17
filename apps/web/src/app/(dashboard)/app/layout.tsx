import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const localAuthBypass =
    process.env.HYRUM_E2E_AUTH_BYPASS === "1" && process.env.NODE_ENV !== "production";

  if (!localAuthBypass) {
    await withAuth({ ensureSignedIn: true });
  }

  return children;
}
