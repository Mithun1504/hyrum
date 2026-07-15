import { readFileSync } from "node:fs";
import { getTableName, is, Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

const expectedTables = [
  "agents",
  "api_operations",
  "api_services",
  "api_spec_operations",
  "api_specs",
  "assertion_consumers",
  "assertion_events",
  "assertions",
  "audit_events",
  "behavior_cluster_members",
  "behavior_clusters",
  "behavior_definitions",
  "behavior_labels",
  "behavior_observations",
  "behavior_spec_classifications",
  "breaking_change_impacts",
  "breaking_change_plans",
  "capture_sessions",
  "ci_runner_sessions",
  "claim_evidence",
  "claim_review_decisions",
  "consumer_identifiers",
  "consumers",
  "corpus_items",
  "data_subject_requests",
  "delta_assertion_matches",
  "delta_claim_matches",
  "dependency_claims",
  "evaluation_datasets",
  "evaluation_metrics",
  "evaluation_runs",
  "extractor_releases",
  "gate_decisions",
  "gate_exceptions",
  "gate_impacts",
  "gate_policies",
  "gate_policy_versions",
  "generated_drafts",
  "github_check_runs",
  "github_installations",
  "github_repositories",
  "ingestion_batches",
  "invitations",
  "jobs",
  "ledger_entries",
  "llm_citations",
  "llm_runs",
  "machine_credentials",
  "mask_profile_versions",
  "memberships",
  "notification_deliveries",
  "notification_preferences",
  "notification_routes",
  "notifications",
  "onboarding_progress",
  "organization_key_versions",
  "organization_settings",
  "organizations",
  "outbox_events",
  "platform_audit_events",
  "platform_operators",
  "prompt_versions",
  "pull_requests",
  "receipts",
  "redaction_policy_versions",
  "replay_attempts",
  "replay_corpora",
  "replay_deltas",
  "replay_profiles",
  "replay_runs",
  "sampling_policy_versions",
  "scheduled_tasks",
  "service_environments",
  "service_repository_connections",
  "slack_installations",
  "stored_objects",
  "support_access_grants",
  "usage_rollups",
  "users",
  "webhook_deliveries",
] as const;

function tableName(value: unknown): string | undefined {
  return is(value, Table) ? getTableName(value) : undefined;
}

describe("database schema", () => {
  it("exports every table specified by SCHEMA.md exactly once", () => {
    const actualTables = Object.values(schema)
      .map(tableName)
      .filter((name) => name !== undefined)
      .sort();

    expect(actualTables).toEqual([...expectedTables].sort());
    expect(actualTables).toHaveLength(80);
  });

  it("keeps policy-critical enum boundaries explicit", () => {
    expect(schema.evidenceTier.enumValues).toEqual(["t1", "t2", "t3"]);
    expect(schema.assertionResolution.enumValues).toContain("deliberately_broken");
    expect(schema.gateOutcome.enumValues).toEqual([
      "pass",
      "note",
      "warn",
      "block",
      "error",
      "cancelled",
    ]);
  });

  it("includes partitioning and fail-closed tenant security migrations", () => {
    const baseline = readFileSync(
      new URL("../migrations/0000_baseline.sql", import.meta.url),
      "utf8",
    );
    const security = readFileSync(
      new URL("../migrations/0001_security.sql", import.meta.url),
      "utf8",
    );

    expect(baseline).toContain('PARTITION BY RANGE ("bucket_start")');
    expect(baseline.match(/PARTITION BY RANGE \("occurred_at"\)/g)).toHaveLength(2);
    expect(security).toContain("ALTER TABLE organizations FORCE ROW LEVEL SECURITY");
    expect(security).toContain("CREATE CONSTRAINT TRIGGER gate_decisions_block_eligibility");
    expect(security).toContain("CREATE CONSTRAINT TRIGGER dependency_claims_t1_evidence");
  });
});
