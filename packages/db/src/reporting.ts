import { and, count, eq, gte, isNull, sql, sum } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiOperations,
  apiServices,
  assertions,
  consumers,
  dependencyClaims,
  gateDecisions,
  ledgerEntries,
  replayRuns,
  usageRollups,
} from "./schema";
import { withOrganizationContext } from "./tenancy";

function grouped(rows: { key: string; value: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
}

export async function getServiceHealthReport(
  db: Database,
  organizationId: string,
  apiServiceId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [service] = await tx
      .select({
        id: apiServices.id,
        name: apiServices.name,
        slug: apiServices.slug,
        firstCaptureAt: apiServices.firstCaptureAt,
        firstUsefulLedgerAt: apiServices.firstUsefulLedgerAt,
      })
      .from(apiServices)
      .where(
        and(
          eq(apiServices.organizationId, organizationId),
          eq(apiServices.id, apiServiceId),
          isNull(apiServices.deletedAt),
        ),
      )
      .limit(1);
    if (!service) return null;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 29);
    const sinceDay = since.toISOString().slice(0, 10);
    const [tiers, freshness, assertionStatus, gateOutcomes, consumerCount, operationCount, usage] =
      await Promise.all([
        tx
          .select({ key: dependencyClaims.tier, value: count() })
          .from(dependencyClaims)
          .where(
            and(
              eq(dependencyClaims.organizationId, organizationId),
              eq(dependencyClaims.apiServiceId, apiServiceId),
              eq(dependencyClaims.status, "active"),
            ),
          )
          .groupBy(dependencyClaims.tier),
        tx
          .select({ key: ledgerEntries.freshnessStatus, value: count() })
          .from(ledgerEntries)
          .innerJoin(
            dependencyClaims,
            and(
              eq(dependencyClaims.organizationId, ledgerEntries.organizationId),
              eq(dependencyClaims.id, ledgerEntries.dependencyClaimId),
            ),
          )
          .where(
            and(
              eq(ledgerEntries.organizationId, organizationId),
              eq(dependencyClaims.apiServiceId, apiServiceId),
              eq(dependencyClaims.status, "active"),
            ),
          )
          .groupBy(ledgerEntries.freshnessStatus),
        tx
          .select({ key: assertions.status, value: count() })
          .from(assertions)
          .where(
            and(
              eq(assertions.organizationId, organizationId),
              eq(assertions.apiServiceId, apiServiceId),
            ),
          )
          .groupBy(assertions.status),
        tx
          .select({ key: gateDecisions.outcome, value: count() })
          .from(gateDecisions)
          .innerJoin(
            replayRuns,
            and(
              eq(replayRuns.organizationId, gateDecisions.organizationId),
              eq(replayRuns.id, gateDecisions.replayRunId),
            ),
          )
          .where(
            and(
              eq(gateDecisions.organizationId, organizationId),
              eq(replayRuns.apiServiceId, apiServiceId),
            ),
          )
          .groupBy(gateDecisions.outcome),
        tx
          .select({ value: count() })
          .from(consumers)
          .where(
            and(
              eq(consumers.organizationId, organizationId),
              eq(consumers.apiServiceId, apiServiceId),
              isNull(consumers.deletedAt),
            ),
          ),
        tx
          .select({ value: count() })
          .from(apiOperations)
          .where(
            and(
              eq(apiOperations.organizationId, organizationId),
              eq(apiOperations.apiServiceId, apiServiceId),
              isNull(apiOperations.archivedAt),
            ),
          ),
        tx
          .select({
            ingestedSessions: sum(usageRollups.ingestedSessions),
            observedRequestsEstimate: sum(usageRollups.observedRequestsEstimate),
            replayRequests: sum(usageRollups.replayRequests),
            llmInputTokens: sum(usageRollups.llmInputTokens),
            llmOutputTokens: sum(usageRollups.llmOutputTokens),
            llmCostMicrounits: sum(usageRollups.llmCostMicrounits),
            jobFailures: sql<number>`coalesce(sum(${usageRollups.jobFailures}), 0)::integer`,
          })
          .from(usageRollups)
          .where(
            and(
              eq(usageRollups.organizationId, organizationId),
              eq(usageRollups.apiServiceId, apiServiceId),
              gte(usageRollups.day, sinceDay),
            ),
          ),
      ]);
    const byTier = grouped(tiers);
    const byFreshness = grouped(freshness);
    const byStatus = grouped(assertionStatus);
    const byOutcome = grouped(gateOutcomes);
    const total = (values: Record<string, number>) =>
      Object.values(values).reduce((sumValue, value) => sumValue + value, 0);
    const usageRow = usage[0];
    return {
      service: { id: service.id, name: service.name, slug: service.slug },
      generatedAt: new Date(),
      ledger: { total: total(byTier), byTier, byFreshness },
      assertions: { total: total(byStatus), byStatus },
      gates: { total: total(byOutcome), byOutcome },
      consumers: Number(consumerCount[0]?.value ?? 0),
      operations: Number(operationCount[0]?.value ?? 0),
      timeToFirstUsefulLedgerSeconds:
        service.firstCaptureAt && service.firstUsefulLedgerAt
          ? Math.max(
              0,
              Math.round(
                (service.firstUsefulLedgerAt.getTime() - service.firstCaptureAt.getTime()) / 1_000,
              ),
            )
          : null,
      usage: {
        windowDays: 30 as const,
        ingestedSessions: usageRow?.ingestedSessions ?? "0",
        observedRequestsEstimate: usageRow?.observedRequestsEstimate ?? "0",
        replayRequests: usageRow?.replayRequests ?? "0",
        llmInputTokens: usageRow?.llmInputTokens ?? "0",
        llmOutputTokens: usageRow?.llmOutputTokens ?? "0",
        llmCostMicrounits: usageRow?.llmCostMicrounits ?? "0",
        jobFailures: usageRow?.jobFailures ?? 0,
      },
    };
  });
}
