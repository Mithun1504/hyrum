import { sql } from "drizzle-orm";
import type { Database } from "./index";
import { withOrganizationContext } from "./tenancy";

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function counts(rows: readonly Record<string, unknown>[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [String(row.key), numeric(row.count)]));
}

export async function getServiceInsights(
  db: Database,
  organizationId: string,
  apiServiceId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const [tiers, freshness, replaySummary, gateRows, assertionRows, qualityRows, usageRows] =
      await Promise.all([
        tx.execute<Record<string, unknown>>(sql`
          select dc.tier as key, count(*)::int as count
          from ledger_entries le
          join dependency_claims dc on dc.organization_id = le.organization_id
            and dc.id = le.dependency_claim_id
          where le.organization_id = ${organizationId} and dc.api_service_id = ${apiServiceId}
            and dc.status = 'active'
          group by dc.tier
        `),
        tx.execute<Record<string, unknown>>(sql`
          select le.freshness_status as key, count(*)::int as count
          from ledger_entries le
          join dependency_claims dc on dc.organization_id = le.organization_id
            and dc.id = le.dependency_claim_id
          where le.organization_id = ${organizationId} and dc.api_service_id = ${apiServiceId}
            and dc.status = 'active'
          group by le.freshness_status
        `),
        tx.execute<Record<string, unknown>>(sql`
          select count(distinct rr.id)::int as total,
            count(rd.id)::int as delta_count,
            count(rd.id) filter (where rd.stability = 'stable')::int as stable_count
          from replay_runs rr
          left join replay_deltas rd on rd.organization_id = rr.organization_id
            and rd.replay_run_id = rr.id
          where rr.organization_id = ${organizationId} and rr.api_service_id = ${apiServiceId}
        `),
        tx.execute<Record<string, unknown>>(sql`
          select gd.outcome as key, count(*)::int as count
          from gate_decisions gd
          join replay_runs rr on rr.organization_id = gd.organization_id
            and rr.id = gd.replay_run_id
          where gd.organization_id = ${organizationId} and rr.api_service_id = ${apiServiceId}
          group by gd.outcome
        `),
        tx.execute<Record<string, unknown>>(sql`
          select status as key, count(*)::int as count
          from assertions
          where organization_id = ${organizationId} and api_service_id = ${apiServiceId}
          group by status
        `),
        tx.execute<Record<string, unknown>>(sql`
          with latest as (
            select id from evaluation_runs
            where organization_id = ${organizationId} and api_service_id = ${apiServiceId}
              and status = 'succeeded'
            order by completed_at desc nulls last, created_at desc limit 1
          )
          select metric_name as key, value, sample_count
          from evaluation_metrics
          where organization_id = ${organizationId}
            and evaluation_run_id = (select id from latest)
            and metric_name in ('precision', 'recall')
            and (evidence_tier = 't1' or evidence_tier is null)
          order by evidence_tier nulls last
        `),
        tx.execute<Record<string, unknown>>(sql`
          select coalesce(sum(ingested_sessions), 0) as ingested_sessions,
            coalesce(sum(observed_requests_estimate), 0) as observed_requests_estimate,
            coalesce(sum(replay_requests), 0) as replay_requests,
            coalesce(sum(llm_cost_microunits), 0) as llm_cost_microunits
          from usage_rollups
          where organization_id = ${organizationId} and api_service_id = ${apiServiceId}
            and day >= current_date - 29
        `),
      ]);
    const tierCounts = counts(tiers);
    const freshnessCounts = counts(freshness);
    const gateOutcomes = counts(gateRows);
    const assertionCounts = counts(assertionRows);
    const replay = replaySummary[0] ?? {};
    const deltaCount = numeric(replay.delta_count);
    const quality = Object.fromEntries(qualityRows.map((row) => [String(row.key), row]));
    const precision = quality.precision;
    const recall = quality.recall;
    const usage = usageRows[0] ?? {};
    return {
      ledger: {
        total: Object.values(tierCounts).reduce((sum, value) => sum + value, 0),
        byTier: { t1: tierCounts.t1 ?? 0, t2: tierCounts.t2 ?? 0, t3: tierCounts.t3 ?? 0 },
        byFreshness: freshnessCounts,
      },
      replays: {
        total: numeric(replay.total),
        stableDeltaRate: deltaCount > 0 ? numeric(replay.stable_count) / deltaCount : null,
        stableDeltaSampleCount: deltaCount,
        gateOutcomes,
      },
      assertions: {
        total: Object.values(assertionCounts).reduce((sum, value) => sum + value, 0),
        byStatus: assertionCounts,
      },
      quality: {
        precision: precision ? numeric(precision.value) : null,
        recall: recall ? numeric(recall.value) : null,
        sampleCount: Math.max(numeric(precision?.sample_count), numeric(recall?.sample_count)),
      },
      usage: {
        ingestedSessions: numeric(usage.ingested_sessions),
        observedRequestsEstimate: numeric(usage.observed_requests_estimate),
        replayRequests: numeric(usage.replay_requests),
        llmCostMicrounits: numeric(usage.llm_cost_microunits),
      },
    };
  });
}

export async function listConsumerInsights(
  db: Database,
  organizationId: string,
  apiServiceId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      select c.id, c.display_alias, c.request_count, c.low_volume, c.first_seen_at, c.last_seen_at,
        count(dc.id) filter (where dc.status = 'active')::int as claim_count,
        count(dc.id) filter (where dc.status = 'active' and dc.tier = 't1')::int as t1_count,
        count(dc.id) filter (where dc.status = 'active' and dc.tier = 't2')::int as t2_count,
        count(dc.id) filter (where dc.status = 'active' and dc.tier = 't3')::int as t3_count
      from consumers c
      left join dependency_claims dc on dc.organization_id = c.organization_id
        and dc.consumer_id = c.id
      left join ledger_entries le on le.organization_id = dc.organization_id
        and le.dependency_claim_id = dc.id
      where c.organization_id = ${organizationId} and c.api_service_id = ${apiServiceId}
        and c.deleted_at is null
      group by c.id
      order by claim_count desc, c.last_seen_at desc
      limit 500
    `);
    return rows.map((row) => ({
      id: String(row.id),
      displayAlias: String(row.display_alias),
      requestCount: numeric(row.request_count),
      lowVolume: Boolean(row.low_volume),
      firstSeenAt: new Date(String(row.first_seen_at)),
      lastSeenAt: new Date(String(row.last_seen_at)),
      claimCount: numeric(row.claim_count),
      t1Count: numeric(row.t1_count),
      t2Count: numeric(row.t2_count),
      t3Count: numeric(row.t3_count),
    }));
  });
}

export async function listEndpointInsights(
  db: Database,
  organizationId: string,
  apiServiceId: string,
) {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      select op.id, op.http_method, op.normalized_path_template, op.display_name,
        count(dc.id) filter (where dc.status = 'active')::int as claim_count,
        count(distinct dc.consumer_id) filter (where dc.status = 'active')::int as consumer_count,
        count(dc.id) filter (where dc.status = 'active' and dc.tier = 't1')::int as t1_count,
        count(dc.id) filter (where dc.status = 'active' and dc.tier = 't2')::int as t2_count,
        count(dc.id) filter (where dc.status = 'active' and dc.tier = 't3')::int as t3_count
      from api_operations op
      left join behavior_definitions bd on bd.organization_id = op.organization_id
        and bd.api_operation_id = op.id
      left join dependency_claims dc on dc.organization_id = bd.organization_id
        and dc.behavior_definition_id = bd.id
      left join ledger_entries le on le.organization_id = dc.organization_id
        and le.dependency_claim_id = dc.id
      where op.organization_id = ${organizationId} and op.api_service_id = ${apiServiceId}
      group by op.id
      order by claim_count desc, op.normalized_path_template, op.http_method
      limit 500
    `);
    return rows.map((row) => ({
      id: String(row.id),
      method: String(row.http_method),
      normalizedPath: String(row.normalized_path_template),
      operationId: row.display_name === null ? null : String(row.display_name),
      claimCount: numeric(row.claim_count),
      consumerCount: numeric(row.consumer_count),
      t1Count: numeric(row.t1_count),
      t2Count: numeric(row.t2_count),
      t3Count: numeric(row.t3_count),
    }));
  });
}
