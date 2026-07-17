ALTER TABLE "jobs" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_app_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid;
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hyrum_worker') THEN
    CREATE ROLE hyrum_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
ALTER ROLE hyrum_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO hyrum_worker;--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'audit_events',
    'progress_events',
    'api_specs',
    'operations',
    'consumers',
    'capture_batches',
    'capture_sessions',
    'behavior_definitions',
    'behavior_observations',
    'receipts',
    'dependency_claims',
    'ledger_entries',
    'assertions',
    'replay_corpora',
    'corpus_items',
    'gate_policies',
    'replay_runs',
    'replay_deltas',
    'gate_decisions',
    'llm_runs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (organization_id = hyrum_app_organization_id()) WITH CHECK (organization_id = hyrum_app_organization_id())',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_tenant_isolation" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_tenant_isolation" ON "organizations"
  FOR ALL
  USING ("id" = hyrum_app_organization_id())
  WITH CHECK ("id" = hyrum_app_organization_id());--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_human_auth_lookup" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_human_auth_lookup" ON "organizations"
  FOR SELECT
  USING ("workos_organization_id" = current_setting('app.workos_organization_id', true));--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_tenant_isolation" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_tenant_isolation" ON "memberships"
  FOR ALL
  USING ("organization_id" = hyrum_app_organization_id())
  WITH CHECK ("organization_id" = hyrum_app_organization_id());--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_human_auth_lookup" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_human_auth_lookup" ON "memberships"
  FOR SELECT
  USING (
    "organization_id" IN (
      SELECT "id" FROM "organizations"
      WHERE "workos_organization_id" = current_setting('app.workos_organization_id', true)
    )
    AND "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "workos_user_id" = current_setting('app.workos_user_id', true)
    )
  );--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "agents_tenant_isolation" ON "agents";--> statement-breakpoint
CREATE POLICY "agents_tenant_isolation" ON "agents"
  FOR ALL
  USING ("organization_id" = hyrum_app_organization_id())
  WITH CHECK ("organization_id" = hyrum_app_organization_id());--> statement-breakpoint
DROP POLICY IF EXISTS "agents_machine_auth_lookup" ON "agents";--> statement-breakpoint
CREATE POLICY "agents_machine_auth_lookup" ON "agents"
  FOR SELECT
  USING (
    "token_prefix" = current_setting('app.agent_token_prefix', true)
    AND "revoked_at" IS NULL
  );--> statement-breakpoint
DROP POLICY IF EXISTS "agents_machine_auth_rotation" ON "agents";--> statement-breakpoint
CREATE POLICY "agents_machine_auth_rotation" ON "agents"
  FOR UPDATE
  USING ("token_prefix" = current_setting('app.agent_token_prefix', true))
  WITH CHECK ("token_prefix" = current_setting('app.agent_token_prefix', true));--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "jobs_tenant_isolation" ON "jobs";--> statement-breakpoint
CREATE POLICY "jobs_tenant_isolation" ON "jobs"
  FOR ALL
  USING ("organization_id" = hyrum_app_organization_id())
  WITH CHECK ("organization_id" = hyrum_app_organization_id());--> statement-breakpoint
DROP POLICY IF EXISTS "jobs_worker_claim" ON "jobs";--> statement-breakpoint
CREATE POLICY "jobs_worker_claim" ON "jobs"
  FOR SELECT
  TO hyrum_worker
  USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "jobs_worker_update" ON "jobs";--> statement-breakpoint
CREATE POLICY "jobs_worker_update" ON "jobs"
  FOR UPDATE
  TO hyrum_worker
  USING (true)
  WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, UPDATE ON "jobs" TO hyrum_worker;--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "outbox_events_tenant_isolation" ON "outbox_events";--> statement-breakpoint
CREATE POLICY "outbox_events_tenant_isolation" ON "outbox_events"
  FOR ALL
  USING ("organization_id" = hyrum_app_organization_id())
  WITH CHECK ("organization_id" = hyrum_app_organization_id());--> statement-breakpoint
DROP POLICY IF EXISTS "outbox_events_worker_publish_select" ON "outbox_events";--> statement-breakpoint
CREATE POLICY "outbox_events_worker_publish_select" ON "outbox_events"
  FOR SELECT
  TO hyrum_worker
  USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "outbox_events_worker_publish_update" ON "outbox_events";--> statement-breakpoint
CREATE POLICY "outbox_events_worker_publish_update" ON "outbox_events"
  FOR UPDATE
  TO hyrum_worker
  USING (true)
  WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, UPDATE ON "outbox_events" TO hyrum_worker;--> statement-breakpoint
GRANT SELECT, UPDATE ON "assertions" TO hyrum_worker;--> statement-breakpoint
GRANT INSERT ON "progress_events" TO hyrum_worker;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "progress_events_id_seq" TO hyrum_worker;
