import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { jobs, organizations } from "./schema";

describe("database schema", () => {
  it("keeps tenant and job foundations in explicit tables", () => {
    expect(getTableName(organizations)).toBe("organizations");
    expect(getTableName(jobs)).toBe("jobs");
  });

  it("enables forced RLS without a caller-controlled global bypass", () => {
    const migrationDir = fileURLToPath(new URL("../migrations", import.meta.url));
    const migration = readdirSync(migrationDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(`${migrationDir}/${file}`, "utf8"))
      .join("\n");
    const orgOwnedTables = [
      "organizations",
      "memberships",
      "agents",
      "github_repositories",
      "slack_channels",
      "jobs",
      "outbox_events",
      "audit_events",
      "progress_events",
      "api_specs",
      "operations",
      "consumers",
      "capture_batches",
      "capture_sessions",
      "behavior_definitions",
      "behavior_observations",
      "receipts",
      "dependency_claims",
      "ledger_entries",
      "assertions",
      "replay_corpora",
      "corpus_items",
      "gate_policies",
      "replay_runs",
      "replay_deltas",
      "replay_assertion_results",
      "gate_decisions",
      "llm_runs",
    ];

    for (const table of orgOwnedTables) {
      expect(migration).toContain(table);
    }
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("app.organization_id");
    expect(migration).not.toContain("app.bypass_rls");
    expect(migration).not.toContain("app.worker_id");
    expect(migration).toContain("CREATE ROLE hyrum_worker");
    expect(migration).toContain("NOBYPASSRLS");
    expect(migration).toContain("TO hyrum_worker");
    expect(migration).toContain('CREATE UNIQUE INDEX "replay_deltas_org_run_case_delta_unique"');
  });
});
