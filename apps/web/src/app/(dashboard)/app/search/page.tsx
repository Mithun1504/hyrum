import type { GlobalSearchResponse } from "@hyrum/contracts";
import { BookOpenText, Braces, Search, Users } from "lucide-react";
import Link from "next/link";
import { GlobalSearch } from "@/components/global-search";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

type GroupKey = keyof GlobalSearchResponse["groups"];

const groupPresentation = {
  endpoints: { title: "Endpoints", icon: Braces },
  consumers: { title: "Consumers", icon: Users },
  ledger: { title: "Ledger evidence", icon: BookOpenText },
} as const satisfies Record<GroupKey, { title: string; icon: typeof Search }>;

export default async function SearchPage({ searchParams }: Readonly<SearchPageProps>) {
  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const result = q.length >= 2 ? await (await currentControlPlaneClient()).search(q, 12) : null;
  const total = result
    ? Object.values(result.groups).reduce((sum, group) => sum + group.length, 0)
    : 0;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Search"
        description="Searches only approved labels, aliases, service names, and normalized endpoint text. Receipt contents and identifiers are never indexed."
      />
      <div className="md:hidden">
        <GlobalSearch defaultValue={q} />
      </div>
      {q.length < 2 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
            <Search className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Enter at least two characters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Find endpoints, privacy-safe consumer aliases, and ledger evidence across this
              workspace.
            </p>
          </CardContent>
        </Card>
      ) : total === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
            <Search className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No results for “{q}”</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try an endpoint path, operation label, or generated consumer alias.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {(Object.keys(result?.groups ?? {}) as GroupKey[]).map((key) => {
            const group = result?.groups[key] ?? [];
            const { title, icon: Icon } = groupPresentation[key];
            return (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    <CardTitle className="text-base">{title}</CardTitle>
                    <Badge variant="secondary" className="ml-auto">
                      {group.length}
                    </Badge>
                  </div>
                  <CardDescription>
                    Tenant-scoped results ordered by recent activity.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {group.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No matches in this group.</p>
                  ) : (
                    <ul className="divide-y">
                      {group.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            className="block rounded-md px-2 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="block truncate text-sm font-medium">{item.title}</span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {item.serviceName} · {item.subtitle}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
