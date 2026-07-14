import { withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, organizationId } = await withAuth({ ensureSignedIn: true });

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-page">
          <Link href="/app" aria-label="Hyrum workspace">
            <BrandMark />
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <Badge variant="outline">Foundation</Badge>
          <div className="ml-auto text-sm text-muted-foreground">
            {user.email} · {organizationId ?? "No organization selected"}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-page">{children}</main>
    </div>
  );
}
