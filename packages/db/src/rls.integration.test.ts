import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.RLS_TEST_ADMIN_URL;
const describeWithDatabase = adminUrl ? describe : describe.skip;
const appRole = "hyrum_rls_app_test";
const workerRole = "hyrum_rls_worker_test";
const password = "hyrum-rls-test-only";
const organizationA = "00000000-0000-4000-8000-000000000a01";
const organizationB = "00000000-0000-4000-8000-000000000b01";
const behaviorA = "00000000-0000-4000-8000-000000000a02";
const behaviorA2 = "00000000-0000-4000-8000-000000000a03";
const behaviorB = "00000000-0000-4000-8000-000000000b02";
const consumerA = "00000000-0000-4000-8000-000000000a04";
const consumerB = "00000000-0000-4000-8000-000000000b04";
const claimA = "00000000-0000-4000-8000-000000000a05";
const claimB = "00000000-0000-4000-8000-000000000b05";

function roleUrl(role: string): string {
  const url = new URL(adminUrl as string);
  url.username = role;
  url.password = password;
  return url.toString();
}

describeWithDatabase("runtime row-level security", () => {
  const admin = postgres(adminUrl as string, { max: 1, prepare: false });
  let app: ReturnType<typeof postgres>;
  let worker: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`DROP ROLE IF EXISTS ${appRole}`);
    await admin.unsafe(`DROP ROLE IF EXISTS ${workerRole}`);
    await admin.unsafe(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
    );
    await admin.unsafe(
      `CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`,
    );
    await admin.unsafe(`GRANT hyrum_worker TO ${workerRole}`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await admin.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`,
    );
    await admin.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`);

    await admin`DELETE FROM organizations WHERE id IN (${organizationA}, ${organizationB})`;
    await admin`INSERT INTO organizations (id, workos_organization_id, name) VALUES
      (${organizationA}, 'rls-org-a', 'RLS A'),
      (${organizationB}, 'rls-org-b', 'RLS B')`;
    await admin`INSERT INTO jobs (organization_id, type, idempotency_key) VALUES
      (${organizationA}, 'test', 'rls-job-a'),
      (${organizationB}, 'test', 'rls-job-b')`;
    await admin`INSERT INTO behavior_definitions
      (id, organization_id, fingerprint_digest, kind, extractor_version, fingerprint)
      VALUES
      (${behaviorA}, ${organizationA}, 'behavior-a', 'shape', 'test', '{}'),
      (${behaviorA2}, ${organizationA}, 'behavior-a2', 'shape', 'test', '{}'),
      (${behaviorB}, ${organizationB}, 'behavior-b', 'shape', 'test', '{}')`;
    await admin`INSERT INTO consumers (id, organization_id, stable_id, display_alias) VALUES
      (${consumerA}, ${organizationA}, 'consumer-a', 'Consumer A'),
      (${consumerB}, ${organizationB}, 'consumer-b', 'Consumer B')`;
    await admin`INSERT INTO dependency_claims
      (id, organization_id, behavior_id, consumer_id, tier)
      VALUES
      (${claimA}, ${organizationA}, ${behaviorA}, ${consumerA}, 'T1'),
      (${claimB}, ${organizationB}, ${behaviorB}, ${consumerB}, 'T1')`;

    app = postgres(roleUrl(appRole), { max: 1, prepare: false });
    worker = postgres(roleUrl(workerRole), { max: 1, prepare: false });
  });

  afterAll(async () => {
    await app?.end();
    await worker?.end();
    await admin`DELETE FROM organizations WHERE id IN (${organizationA}, ${organizationB})`;
    await admin.unsafe(`DROP OWNED BY ${appRole}`);
    await admin.unsafe(`DROP OWNED BY ${workerRole}`);
    await admin.unsafe(`DROP ROLE IF EXISTS ${appRole}`);
    await admin.unsafe(`DROP ROLE IF EXISTS ${workerRole}`);
    await admin.end();
  });

  it("does not turn a caller-set setting into queue-wide access", async () => {
    await app`SELECT set_config('app.worker_id', 'forged-worker', false)`;
    expect(await app`SELECT id FROM jobs`).toHaveLength(0);

    await app`SELECT set_config('app.organization_id', ${organizationA}, false)`;
    const tenantJobs = await app`SELECT organization_id FROM jobs`;
    expect(tenantJobs).toHaveLength(1);
    expect(tenantJobs[0]?.organization_id).toBe(organizationA);
  });

  it("grants queue-wide access only to the non-bypass worker role", async () => {
    const [role] = await admin`
      SELECT rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = ${workerRole}
    `;
    expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false });

    const queuedJobs = await worker`SELECT organization_id FROM jobs ORDER BY organization_id`;
    expect(queuedJobs.map((row) => row.organization_id)).toEqual([organizationA, organizationB]);
  });

  it("rejects assertion claims from another behavior or tenant", async () => {
    await expect(
      admin`INSERT INTO assertions
        (organization_id, behavior_id, claim_id, owner_id, reason, expires_at)
        VALUES (${organizationA}, ${behaviorA2}, ${claimA}, 'test', 'wrong behavior', now() + interval '1 day')`,
    ).rejects.toMatchObject({ code: "23503" });

    await expect(
      admin`INSERT INTO assertions
        (organization_id, behavior_id, claim_id, owner_id, reason, expires_at)
        VALUES (${organizationA}, ${behaviorA}, ${claimB}, 'test', 'wrong tenant', now() + interval '1 day')`,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects non-T1 block tiers at the database boundary", async () => {
    await expect(
      admin`INSERT INTO gate_policies (organization_id, version, block_tiers, warn_tiers)
        VALUES (${organizationA}, 1, ARRAY['T2']::text[], ARRAY[]::text[])`,
    ).rejects.toMatchObject({ code: "23514" });
  });
});
