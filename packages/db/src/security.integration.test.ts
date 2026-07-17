import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./index";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

type BaseFixture = {
  organizationId: string;
  membershipId: string;
  serviceId: string;
  environmentId: string;
  extractorId: string;
  operationId: string;
  consumerId: string;
  behaviorId: string;
};

const id = () => crypto.randomUUID();
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function createBaseFixture(tx: TransactionSql): Promise<BaseFixture> {
  const fixture = {
    organizationId: id(),
    membershipId: id(),
    serviceId: id(),
    environmentId: id(),
    extractorId: id(),
    operationId: id(),
    consumerId: id(),
    behaviorId: id(),
  };
  const userId = id();
  const suffix = fixture.organizationId.slice(0, 8);

  await tx`select set_config('app.organization_id', ${fixture.organizationId}, true)`;
  await tx`insert into users (id, workos_user_id, primary_email)
    values (${userId}, ${`security-user-${suffix}`}, ${`security-${suffix}@example.test`})`;
  await tx`insert into organizations (id, workos_organization_id, slug, name, status)
    values (${fixture.organizationId}, ${`security-org-${suffix}`}, ${`security-${suffix}`}, 'Security test', 'provisioning')`;
  await tx`insert into memberships (id, organization_id, user_id, role, status)
    values (${fixture.membershipId}, ${fixture.organizationId}, ${userId}, 'owner', 'active')`;
  await tx`insert into api_services (id, organization_id, name, slug, owner_membership_id)
    values (${fixture.serviceId}, ${fixture.organizationId}, 'Security API', ${`security-api-${suffix}`}, ${fixture.membershipId})`;
  await tx`insert into service_environments
    (id, organization_id, api_service_id, name, slug, kind, is_default)
    values (${fixture.environmentId}, ${fixture.organizationId}, ${fixture.serviceId}, 'Test', 'test', 'demo', true)`;
  await tx`insert into extractor_releases
    (id, semantic_version, source_commit_sha, binary_digest, fingerprint_schema_version, released_at)
    values (${fixture.extractorId}, ${`0.0.0-security-${suffix}`}, ${`commit-${suffix}`}, ${`extractor-${suffix}`}, 1, now())`;
  await tx`insert into api_operations
    (id, organization_id, api_service_id, http_method, normalized_path_template, operation_key, first_seen_at, last_seen_at)
    values (${fixture.operationId}, ${fixture.organizationId}, ${fixture.serviceId}, 'GET', '/security-test', ${`security.operation.${suffix}`}, now(), now())`;
  await tx`insert into consumers
    (id, organization_id, api_service_id, environment_id, display_alias, first_seen_at, last_seen_at)
    values (${fixture.consumerId}, ${fixture.organizationId}, ${fixture.serviceId}, ${fixture.environmentId}, 'Security consumer', now(), now())`;
  await tx`insert into behavior_definitions
    (id, organization_id, api_service_id, api_operation_id, kind, fingerprint_schema_version,
     extractor_release_id, canonical_fingerprint, fingerprint_digest, default_label, first_seen_at, last_seen_at)
    values (${fixture.behaviorId}, ${fixture.organizationId}, ${fixture.serviceId}, ${fixture.operationId},
      'shape', 1, ${fixture.extractorId}, '{}'::jsonb, ${`behavior-${suffix}`}, 'Security behavior', now(), now())`;

  return fixture;
}

async function createGateFixture(
  tx: TransactionSql,
  base: BaseFixture,
  stability: "stable" | "flaky",
  matched: boolean,
): Promise<void> {
  const objectId = id();
  const maskId = id();
  const profileId = id();
  const policyId = id();
  const policyVersionId = id();
  const corpusId = id();
  const runId = id();
  const assertionId = id();
  const deltaId = id();
  const decisionId = id();
  const suffix = runId.slice(0, 8);

  await tx`insert into stored_objects
    (id, organization_id, kind, bucket, object_key, content_type, byte_size, sha256_digest,
     scan_status, availability_status, created_by_actor_type)
    values (${objectId}, ${base.organizationId}, 'replay_corpus', 'security-tests', ${suffix},
      'application/json', 1, ${`object-${suffix}`}, 'clean', 'available', 'system')`;
  await tx`insert into mask_profile_versions
    (id, organization_id, api_service_id, version, rules, rules_digest, status)
    values (${maskId}, ${base.organizationId}, ${base.serviceId}, 1, '{}'::jsonb, ${`mask-${suffix}`}, 'active')`;
  await tx`insert into replay_profiles
    (id, organization_id, api_service_id, version, name, mask_profile_version_id,
     request_timeout_ms, config_digest, status)
    values (${profileId}, ${base.organizationId}, ${base.serviceId}, 1, 'Security profile',
      ${maskId}, 1000, ${`profile-${suffix}`}, 'active')`;
  await tx`insert into gate_policies (id, organization_id, api_service_id, name, is_default)
    values (${policyId}, ${base.organizationId}, ${base.serviceId}, 'Security policy', true)`;
  await tx`insert into gate_policy_versions
    (id, organization_id, gate_policy_id, version, config, config_digest, status)
    values (${policyVersionId}, ${base.organizationId}, ${policyId}, 1, '{}'::jsonb, ${`policy-${suffix}`}, 'active')`;
  await tx`insert into replay_corpora
    (id, organization_id, api_service_id, environment_id, version, status, stored_object_id,
     corpus_digest, extractor_release_id, selection_algorithm_version, source_window_start,
     source_window_end, item_count, operation_count, consumer_count, assertion_count, expires_at)
    values (${corpusId}, ${base.organizationId}, ${base.serviceId}, ${base.environmentId}, 1, 'ready',
      ${objectId}, ${`corpus-${suffix}`}, ${base.extractorId}, 'security-test', now() - interval '1 hour',
      now(), 1, 1, 1, 1, now() + interval '1 day')`;
  await tx`insert into replay_runs
    (id, organization_id, api_service_id, environment_id, replay_corpus_id, replay_profile_id,
     extractor_release_id, gate_policy_version_id, trigger_type, trigger_idempotency_key,
     base_image_digest, candidate_image_digest, fixture_digest, mask_digest, runner_version,
     status, requested_by_actor_type)
    values (${runId}, ${base.organizationId}, ${base.serviceId}, ${base.environmentId}, ${corpusId},
      ${profileId}, ${base.extractorId}, ${policyVersionId}, 'manual', ${`trigger-${suffix}`},
      'base', 'candidate', 'fixture', ${`mask-${suffix}`}, 'security-test', 'succeeded', 'system')`;
  await tx`insert into assertions
    (id, organization_id, api_service_id, behavior_definition_id, owner_membership_id, reason,
     status, scope, starts_at, expires_at)
    values (${assertionId}, ${base.organizationId}, ${base.serviceId}, ${base.behaviorId},
      ${base.membershipId}, 'Security invariant', 'active', 'all_consumers', now() - interval '1 hour', now() + interval '1 day')`;
  await tx`insert into replay_deltas
    (id, organization_id, replay_run_id, api_operation_id, kind, delta_digest, stability,
     agreeing_attempts, total_attempts)
    values (${deltaId}, ${base.organizationId}, ${runId}, ${base.operationId}, 'shape',
      ${`delta-${suffix}`}, ${stability}, 2, 2)`;
  await tx`insert into delta_assertion_matches
    (organization_id, replay_delta_id, assertion_id, match_rule_version, match_digest, matched,
     ineligibility_reason)
    values (${base.organizationId}, ${deltaId}, ${assertionId}, 'security-test',
      ${`match-${suffix}`}, ${matched}, ${matched ? null : "path_not_matched"})`;
  await tx`insert into gate_decisions
    (id, organization_id, replay_run_id, gate_policy_version_id, outcome,
     decision_engine_version, decision_digest, blocking_impact_count, evaluated_at)
    values (${decisionId}, ${base.organizationId}, ${runId}, ${policyVersionId}, 'block',
      'security-test', ${`decision-${suffix}`}, 1, now())`;
  await tx`insert into gate_impacts
    (organization_id, gate_decision_id, replay_delta_id, consumer_id, assertion_id, action, reason_code)
    values (${base.organizationId}, ${decisionId}, ${deltaId}, ${base.consumerId},
      ${assertionId}, 'block', 'assertion_match')`;
  await tx.unsafe(
    "set constraints gate_decisions_block_eligibility, gate_impacts_block_eligibility immediate",
  );
}

suite("database security invariants", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 1);
  });

  afterAll(async () => {
    await client.close();
  });

  it("applies fail-closed RLS when a partition child is queried directly", async (context) => {
    const [capability] = await client.sql<
      { canCreateRole: boolean; currentUser: string; partitionExists: boolean }[]
    >`select (r.rolsuper or r.rolcreaterole) as "canCreateRole", current_user as "currentUser",
      to_regclass('public.audit_events_2026_07') is not null as "partitionExists"
      from pg_roles r where r.rolname = current_user`;
    if (!capability?.canCreateRole || !capability.partitionExists) {
      context.skip();
      return;
    }

    const markerOrganizationId = id();
    const markerEventId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const role = `hyrum_rls_test_${id().replaceAll("-", "")}`;
    const roleSql = quoteIdentifier(role);
    const currentUserSql = quoteIdentifier(capability.currentUser);

    await client.sql
      .begin(async (tx) => {
        await tx`select set_config('app.organization_id', ${markerOrganizationId}, true)`;
        await tx`insert into organizations (id, workos_organization_id, slug, name, status)
        values (${markerOrganizationId}, ${`rls-${markerOrganizationId}`}, ${`rls-${markerOrganizationId}`}, 'RLS marker', 'provisioning')`;
        await tx`insert into audit_events_2026_07
        (organization_id, occurred_at, id, actor_type, action, resource_type, request_id, outcome)
        values (${markerOrganizationId}, '2026-07-15T00:00:00Z', ${markerEventId}, 'system', 'security.test',
          'security_test', ${markerOrganizationId}, 'succeeded')`;
        await tx.unsafe(`create role ${roleSql} nologin nobypassrls`);
        await tx.unsafe(`grant ${roleSql} to ${currentUserSql}`);
        await tx.unsafe(`grant usage on schema public to ${roleSql}`);
        await tx.unsafe(`grant select on audit_events_2026_07 to ${roleSql}`);
        await tx.unsafe(`set local role ${roleSql}`);
        await tx`select set_config('app.organization_id', '', true)`;
        const [closed] = await tx<{ count: number }[]>`select count(*)::int as count
        from audit_events_2026_07 where request_id = ${markerOrganizationId}`;
        expect(closed?.count).toBe(0);
        await tx`select set_config('app.organization_id', ${markerOrganizationId}, true)`;
        const [visible] = await tx<{ count: number }[]>`select count(*)::int as count
        from audit_events_2026_07 where request_id = ${markerOrganizationId}`;
        expect(visible?.count).toBe(1);
        await tx.unsafe("reset role");
        throw new Error("rollback security fixture");
      })
      .catch((error: unknown) => {
        expect(error).toMatchObject({ message: "rollback security fixture" });
      });
  });

  it("rejects an active T1 claim without complete echo evidence", async () => {
    await expect(
      client.sql.begin(async (tx) => {
        const base = await createBaseFixture(tx);
        await tx`insert into dependency_claims
          (organization_id, api_service_id, environment_id, consumer_id, behavior_definition_id,
           tier, status, rule_version, deterministic_eligible, support_count, effective_from, proposed_by)
          values (${base.organizationId}, ${base.serviceId}, ${base.environmentId}, ${base.consumerId},
            ${base.behaviorId}, 't1', 'active', 'security-test', true, 1, now(), 'rules')`;
        await tx.unsafe("set constraints dependency_claims_t1_evidence immediate");
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it.each([
    { label: "flaky", stability: "flaky" as const, matched: true },
    { label: "unmatched", stability: "stable" as const, matched: false },
  ])("rejects a blocking gate on a $label replay path", async ({ stability, matched }) => {
    await expect(
      client.sql.begin(async (tx) => {
        const base = await createBaseFixture(tx);
        await createGateFixture(tx, base, stability, matched);
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
