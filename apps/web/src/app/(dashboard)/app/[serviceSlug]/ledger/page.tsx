import { ControlPlaneError } from "@hyrum/api-client";
import { Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currentControlPlaneClient } from "@/services/control-plane";
import { LabelProposalControl } from "./label-proposal-control";
import { ReceiptButton } from "./receipt-button";
import { ReviewControl } from "./review-control";
import { TierProposalControl } from "./tier-proposal-control";

interface LedgerPageProps {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ search?: string; tier?: "t1" | "t2" | "t3"; cursor?: string }>;
}

const tierMeaning = {
  t1: "Proven echo dependency",
  t2: "Pattern evidence — warning only",
  t3: "Exposure only — never blocks",
} as const;

export default async function LedgerPage({ params, searchParams }: Readonly<LedgerPageProps>) {
  const [{ serviceSlug }, filters] = await Promise.all([params, searchParams]);
  const client = await currentControlPlaneClient();
  let pageData: Awaited<ReturnType<typeof client.ledger>>;
  let service: Awaited<ReturnType<typeof client.service>>;
  let session: Awaited<ReturnType<typeof client.session>>;
  try {
    [service, pageData, session] = await Promise.all([
      client.service(serviceSlug),
      client.ledger(serviceSlug, filters),
      client.session(),
    ]);
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }
  const tierCounts = { t1: 0, t2: 0, t3: 0 };
  for (const entry of pageData.data) tierCounts[entry.tier]++;
  const behaviorIds = [...new Set(pageData.data.map(({ behavior }) => behavior.id))];
  const advisories = await client.advisoryBatch({
    behaviorIds,
    claimIds: pageData.data.map(({ dependencyClaimId }) => dependencyClaimId),
  });
  const labelProposals = new Map(
    advisories.labels.map(({ behaviorDefinitionId, proposal }) => [behaviorDefinitionId, proposal]),
  );
  const tierProposals = new Map(
    advisories.tiers.map(({ dependencyClaimId, proposal }) => [dependencyClaimId, proposal]),
  );
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Accidental-contract ledger"
        title={`${service.name} dependencies`}
        description="Per-consumer behavior evidence after subtracting the current OpenAPI contract. Only T1 echo proof can block a change."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {(["t1", "t2", "t3"] as const).map((tier) => (
          <Card key={tier}>
            <CardHeader className="pb-3">
              <CardDescription>{tierMeaning[tier]}</CardDescription>
              <CardTitle className="text-2xl">{tierCounts[tier]}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Observed contracts</CardTitle>
          <CardDescription>
            Receipts are redacted, bounded to one capture session, permission checked, audited, and
            short lived.
          </CardDescription>
          <form className="flex flex-col gap-2 pt-3 sm:flex-row" method="get">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                name="search"
                defaultValue={filters.search}
                placeholder="Search consumer, endpoint, or behavior"
                className="pl-9"
              />
            </div>
            <select
              name="tier"
              defaultValue={filters.tier ?? ""}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All tiers</option>
              <option value="t1">T1 proof</option>
              <option value="t2">T2 pattern</option>
              <option value="t3">T3 exposure</option>
            </select>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {pageData.data.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-medium">No matching ledger entries</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect traffic and keep the current specification active to infer evidence.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Consumer</TableHead>
                    <TableHead>Behavior</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Last observed</TableHead>
                    <TableHead>Receipt</TableHead>
                    {session.permissions.includes("claim:review") ? (
                      <TableHead>Review</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.consumer.displayAlias}</TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {labelProposals.get(entry.behavior.id)?.status === "active"
                            ? labelProposals.get(entry.behavior.id)?.label
                            : entry.behavior.label}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {entry.operation.method} {entry.operation.path}
                        </p>
                        {session.permissions.includes("claim:review") ? (
                          <LabelProposalControl
                            serviceSlug={serviceSlug}
                            behaviorId={entry.behavior.id}
                            proposal={labelProposals.get(entry.behavior.id) ?? null}
                            recentlyAuthenticated={session.recentlyAuthenticated}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={entry.tier === "t1" ? "default" : "outline"}
                          className="uppercase"
                        >
                          {entry.tier}
                        </Badge>
                        <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                          {tierMeaning[entry.tier]}
                        </p>
                        {session.permissions.includes("claim:review") ? (
                          <TierProposalControl
                            serviceSlug={serviceSlug}
                            claimId={entry.dependencyClaimId}
                            currentTier={entry.tier}
                            proposal={tierProposals.get(entry.dependencyClaimId) ?? null}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                          new Date(entry.lastObservedAt),
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.receipt?.availability === "available" ? (
                          <ReceiptButton receiptId={entry.receipt.id} />
                        ) : (
                          <span className="text-sm text-muted-foreground">Unavailable</span>
                        )}
                      </TableCell>
                      {session.permissions.includes("claim:review") ? (
                        <TableCell>
                          {session.recentlyAuthenticated ? (
                            <ReviewControl
                              serviceSlug={serviceSlug}
                              ledgerEntryId={entry.id}
                              tier={entry.tier}
                              updatedAt={entry.updatedAt}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Re-authenticate to review
                            </span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pageData.page.nextCursor ? (
            <div className="mt-4 flex justify-end">
              <Button asChild variant="outline">
                <Link
                  href={{
                    pathname: `/app/${serviceSlug}/ledger`,
                    query: {
                      ...(filters.search ? { search: filters.search } : {}),
                      ...(filters.tier ? { tier: filters.tier } : {}),
                      cursor: pageData.page.nextCursor,
                    },
                  }}
                >
                  Next page
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
