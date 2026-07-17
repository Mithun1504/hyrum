import { Activity, Clock3, Database, GitCompareArrows, Pin, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";

interface ReportsPageProps {
  params: Promise<{ serviceSlug: string }>;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Insufficient sample";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

function addIntegerStrings(left: string, right: string) {
  return (BigInt(left) + BigInt(right)).toLocaleString();
}

function Distribution({ values }: { values: Record<string, number> }) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Insufficient sample</p>;
  return (
    <dl className="space-y-3">
      {Object.entries(values).map(([label, value]) => {
        const percentage = Math.round((value / total) * 100);
        return (
          <div key={label}>
            <div className="flex items-center justify-between text-sm">
              <dt className="capitalize">{label.replaceAll("_", " ")}</dt>
              <dd className="font-mono text-xs">
                {value} · {percentage}%
              </dd>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
            </div>
          </div>
        );
      })}
    </dl>
  );
}

export default async function ReportsPage({ params }: Readonly<ReportsPageProps>) {
  const { serviceSlug } = await params;
  const report = await (await currentControlPlaneClient()).serviceHealthReport(serviceSlug);
  const summary = [
    { label: "Active ledger entries", value: report.ledger.total, icon: Database },
    { label: "Known consumers", value: report.consumers, icon: Users },
    { label: "API operations", value: report.operations, icon: Activity },
    { label: "Assertions", value: report.assertions.total, icon: Pin },
    { label: "Gate decisions", value: report.gates.total, icon: GitCompareArrows },
    {
      label: "Time to useful ledger",
      value: formatDuration(report.timeToFirstUsefulLedgerSeconds),
      icon: Clock3,
    },
  ];
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Operational insight"
        title={`${report.service.name} health`}
        description="Evidence freshness, assertion health, deterministic gate outcomes, and 30-day capacity signals. Empty metrics are shown explicitly instead of inferred."
        actions={
          <Badge variant="outline">Generated {new Date(report.generatedAt).toLocaleString()}</Badge>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summary.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>{label}</CardDescription>
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evidence tiers</CardTitle>
            <CardDescription>
              T1 is deterministic echo evidence; T2 warns; T3 never blocks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Distribution values={report.ledger.byTier} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evidence freshness</CardTitle>
            <CardDescription>Current active ledger entries by freshness state.</CardDescription>
          </CardHeader>
          <CardContent>
            <Distribution values={report.ledger.byFreshness} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gate outcomes</CardTitle>
            <CardDescription>Persisted deterministic decisions across replay runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Distribution values={report.gates.byOutcome} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>30-day usage</CardTitle>
          <CardDescription>
            Capacity and cost visibility only; these aggregates are not billing records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">Ingested sessions</dt>
              <dd className="mt-1 text-xl font-semibold">{report.usage.ingestedSessions}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Observed requests</dt>
              <dd className="mt-1 text-xl font-semibold">
                {report.usage.observedRequestsEstimate}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Replay requests</dt>
              <dd className="mt-1 text-xl font-semibold">{report.usage.replayRequests}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">LLM tokens</dt>
              <dd className="mt-1 text-xl font-semibold">
                {addIntegerStrings(report.usage.llmInputTokens, report.usage.llmOutputTokens)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}
