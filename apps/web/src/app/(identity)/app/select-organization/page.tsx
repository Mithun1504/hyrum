import { withAuth } from "@workos-inc/authkit-nextjs";
import { ArrowRight, Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authenticatedControlPlaneClient } from "@/services/control-plane";
import { selectOrganization } from "./actions";

export const metadata: Metadata = { title: "Choose a workspace" };

export default async function SelectOrganizationPage() {
  const {
    user,
    accessToken,
    organizationId: currentOrganizationId,
  } = await withAuth({
    ensureSignedIn: true,
  });
  const { data: organizations } =
    await authenticatedControlPlaneClient(accessToken).identityOrganizations();

  return (
    <main className="min-h-dvh bg-background px-page py-6 text-foreground sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex items-center justify-between gap-4">
          <BrandMark />
          <ThemeToggle />
        </header>

        <section aria-labelledby="workspace-heading" className="space-y-6">
          <div className="space-y-2">
            <h1 id="workspace-heading" className="text-3xl font-semibold tracking-tight">
              Choose a workspace
            </h1>
            <p className="text-sm text-muted-foreground">
              Signed in as {user.email}. Your role and data access are scoped independently in each
              workspace.
            </p>
          </div>

          {organizations.length > 0 ? (
            <div className="grid gap-3">
              {organizations.map((organization) => {
                const isCurrent = organization.workosOrganizationId === currentOrganizationId;
                return (
                  <Card key={organization.organizationId}>
                    <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-x-4">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="size-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate">{organization.name}</CardTitle>
                        <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                          <span>{organization.role}</span>
                          {organization.status === "provisioning" ? (
                            <Badge variant="secondary">Setting up</Badge>
                          ) : null}
                          {isCurrent ? <Badge variant="outline">Current</Badge> : null}
                        </CardDescription>
                      </div>
                      <form action={selectOrganization}>
                        <input
                          type="hidden"
                          name="organizationId"
                          value={organization.workosOrganizationId}
                        />
                        <Button type="submit" variant={isCurrent ? "outline" : "default"}>
                          {isCurrent ? "Open" : "Select"}
                          <ArrowRight aria-hidden="true" />
                        </Button>
                      </form>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No workspace membership found</CardTitle>
                <CardDescription>
                  Ask a workspace owner to invite {user.email}, then refresh this page after
                  accepting the invitation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/">Return home</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
