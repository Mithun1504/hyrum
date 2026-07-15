-- Tenant context is set by the API/worker transaction as a validated UUID string.
CREATE OR REPLACE FUNCTION hyrum_current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;--> statement-breakpoint

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
    'agents', 'api_operations', 'api_services', 'api_spec_operations', 'api_specs',
    'assertion_consumers', 'assertion_events', 'assertions', 'audit_events',
    'behavior_cluster_members', 'behavior_clusters', 'behavior_definitions', 'behavior_labels',
    'behavior_observations', 'behavior_spec_classifications', 'breaking_change_impacts',
    'breaking_change_plans', 'capture_sessions', 'ci_runner_sessions', 'claim_evidence',
    'claim_review_decisions', 'consumer_identifiers', 'consumers', 'corpus_items',
    'data_subject_requests', 'delta_assertion_matches', 'delta_claim_matches',
    'dependency_claims', 'gate_decisions', 'gate_exceptions', 'gate_impacts', 'gate_policies',
    'gate_policy_versions', 'generated_drafts', 'github_check_runs', 'github_installations',
    'github_repositories', 'ingestion_batches', 'invitations', 'jobs', 'ledger_entries',
    'llm_citations', 'llm_runs', 'machine_credentials', 'mask_profile_versions', 'memberships',
    'notification_deliveries', 'notification_preferences', 'notification_routes', 'notifications',
    'onboarding_progress', 'organization_key_versions', 'organization_settings', 'outbox_events',
    'pull_requests', 'receipts', 'redaction_policy_versions', 'replay_attempts', 'replay_corpora',
    'replay_deltas', 'replay_profiles', 'replay_runs', 'sampling_policy_versions',
    'scheduled_tasks', 'service_environments', 'service_repository_connections',
    'slack_installations', 'stored_objects', 'support_access_grants', 'usage_rollups',
    'webhook_deliveries'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = hyrum_current_organization_id()) WITH CHECK (organization_id = hyrum_current_organization_id())',
      table_name
    );
  END LOOP;
END $$;--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations
  USING (id = hyrum_current_organization_id())
  WITH CHECK (id = hyrum_current_organization_id());--> statement-breakpoint

ALTER TABLE evaluation_datasets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE evaluation_datasets FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY evaluation_datasets_read ON evaluation_datasets FOR SELECT
  USING (scope = 'global' OR organization_id = hyrum_current_organization_id());--> statement-breakpoint
CREATE POLICY evaluation_datasets_tenant_write ON evaluation_datasets FOR ALL
  USING (scope = 'organization' AND organization_id = hyrum_current_organization_id())
  WITH CHECK (scope = 'organization' AND organization_id = hyrum_current_organization_id());--> statement-breakpoint

ALTER TABLE evaluation_runs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE evaluation_runs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY evaluation_runs_read ON evaluation_runs FOR SELECT
  USING (scope = 'global' OR organization_id = hyrum_current_organization_id());--> statement-breakpoint
CREATE POLICY evaluation_runs_tenant_write ON evaluation_runs FOR ALL
  USING (scope = 'organization' AND organization_id = hyrum_current_organization_id())
  WITH CHECK (scope = 'organization' AND organization_id = hyrum_current_organization_id());--> statement-breakpoint

ALTER TABLE evaluation_metrics ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE evaluation_metrics FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY evaluation_metrics_read ON evaluation_metrics FOR SELECT
  USING (scope = 'global' OR organization_id = hyrum_current_organization_id());--> statement-breakpoint
CREATE POLICY evaluation_metrics_tenant_write ON evaluation_metrics FOR ALL
  USING (scope = 'organization' AND organization_id = hyrum_current_organization_id())
  WITH CHECK (scope = 'organization' AND organization_id = hyrum_current_organization_id());--> statement-breakpoint

-- Validate key purpose without exposing or storing any key material.
CREATE OR REPLACE FUNCTION hyrum_validate_key_purpose()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  key_id uuid;
  expected key_purpose;
BEGIN
  key_id := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  expected := TG_ARGV[1]::key_purpose;
  IF key_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_key_versions k
    WHERE k.id = key_id AND k.organization_id = NEW.organization_id AND k.purpose = expected
  ) THEN
    RAISE EXCEPTION 'key version % must have purpose % in organization %', key_id, expected, NEW.organization_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER stored_objects_key_purpose
BEFORE INSERT OR UPDATE OF encryption_key_version_id ON stored_objects
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_key_purpose('encryption_key_version_id', 'object_encryption');--> statement-breakpoint
CREATE TRIGGER redaction_policy_structural_key_purpose
BEFORE INSERT OR UPDATE OF structural_hmac_key_version_id ON redaction_policy_versions
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_key_purpose('structural_hmac_key_version_id', 'structural_hmac');--> statement-breakpoint
CREATE TRIGGER redaction_policy_consumer_key_purpose
BEFORE INSERT OR UPDATE OF consumer_hmac_key_version_id ON redaction_policy_versions
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_key_purpose('consumer_hmac_key_version_id', 'consumer_identity_hmac');--> statement-breakpoint
CREATE TRIGGER consumer_identifiers_key_purpose
BEFORE INSERT OR UPDATE OF consumer_hmac_key_version_id ON consumer_identifiers
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_key_purpose('consumer_hmac_key_version_id', 'consumer_identity_hmac');--> statement-breakpoint
CREATE TRIGGER capture_sessions_key_purpose
BEFORE INSERT OR UPDATE OF structural_hmac_key_version_id ON capture_sessions
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_key_purpose('structural_hmac_key_version_id', 'structural_hmac');--> statement-breakpoint
CREATE TRIGGER slack_installations_key_purpose
BEFORE INSERT OR UPDATE OF encryption_key_version_id ON slack_installations
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_key_purpose('encryption_key_version_id', 'integration_encryption');--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_active_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  org_id uuid;
  key_name text;
BEGIN
  key_name := CASE WHEN TG_TABLE_NAME = 'organizations' THEN 'id' ELSE 'organization_id' END;
  org_id := COALESCE(
    (to_jsonb(NEW) ->> key_name)::uuid,
    (to_jsonb(OLD) ->> key_name)::uuid
  );
  IF EXISTS (SELECT 1 FROM organizations o WHERE o.id = org_id AND o.status = 'active')
     AND NOT EXISTS (
       SELECT 1 FROM memberships m
       WHERE m.organization_id = org_id AND m.role = 'owner' AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'active organization % must retain an active owner', org_id USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER organizations_active_owner
AFTER INSERT OR UPDATE OF status ON organizations DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_owner();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER memberships_active_owner
AFTER INSERT OR UPDATE OR DELETE ON memberships DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_owner();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_assertion_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assertion_key uuid;
  assertion_scope assertion_scope;
  scoped_count integer;
  key_name text;
BEGIN
  key_name := CASE WHEN TG_TABLE_NAME = 'assertions' THEN 'id' ELSE 'assertion_id' END;
  assertion_key := COALESCE(
    (to_jsonb(NEW) ->> key_name)::uuid,
    (to_jsonb(OLD) ->> key_name)::uuid
  );
  SELECT a.scope INTO assertion_scope FROM assertions a WHERE a.id = assertion_key;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT count(*) INTO scoped_count FROM assertion_consumers ac WHERE ac.assertion_id = assertion_key;
  IF (assertion_scope = 'selected_consumers' AND scoped_count = 0)
     OR (assertion_scope = 'all_consumers' AND scoped_count <> 0) THEN
    RAISE EXCEPTION 'assertion % has invalid consumer scope', assertion_key USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER assertions_scope_consistency
AFTER INSERT OR UPDATE OF scope ON assertions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_assertion_scope();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER assertion_consumers_scope_consistency
AFTER INSERT OR UPDATE OR DELETE ON assertion_consumers DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_assertion_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_active_t1_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claim_key uuid;
  key_name text;
BEGIN
  key_name := CASE WHEN TG_TABLE_NAME = 'dependency_claims' THEN 'id' ELSE 'dependency_claim_id' END;
  claim_key := COALESCE(
    (to_jsonb(NEW) ->> key_name)::uuid,
    (to_jsonb(OLD) ->> key_name)::uuid
  );
  IF EXISTS (
    SELECT 1 FROM dependency_claims c
    WHERE c.id = claim_key AND c.status = 'active' AND c.tier = 't1'
  ) AND NOT EXISTS (
    SELECT 1 FROM claim_evidence ce
    JOIN receipts r ON r.id = ce.receipt_id AND r.organization_id = ce.organization_id
    WHERE ce.dependency_claim_id = claim_key
      AND ce.evidence_role = 'primary'
      AND r.receipt_type = 't1_echo'
      AND r.availability_status = 'available'
      AND r.expires_at > now()
      AND ce.request_sequence_no > ce.response_sequence_no
      AND ce.value_hmac IS NOT NULL
      AND ce.structural_hmac_key_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'active T1 claim % requires eligible primary echo evidence', claim_key USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dependency_claims_t1_evidence
AFTER INSERT OR UPDATE OF status, tier, deterministic_eligible ON dependency_claims
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER claim_evidence_t1_evidence
AFTER INSERT OR UPDATE OR DELETE ON claim_evidence
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_breaking_change_plan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE assertion_expiry timestamptz;
BEGIN
  SELECT expires_at INTO assertion_expiry FROM assertions WHERE id = NEW.assertion_id;
  IF NEW.status IN ('scheduled', 'communication_ready') AND NEW.planned_for > assertion_expiry THEN
    RAISE EXCEPTION 'planned break must not exceed assertion expiry' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER breaking_change_plan_window
BEFORE INSERT OR UPDATE OF status, planned_for, assertion_id ON breaking_change_plans
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_breaking_change_plan();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_gate_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  decision_key uuid;
  key_name text;
BEGIN
  key_name := CASE WHEN TG_TABLE_NAME = 'gate_decisions' THEN 'id' ELSE 'gate_decision_id' END;
  decision_key := COALESCE(
    (to_jsonb(NEW) ->> key_name)::uuid,
    (to_jsonb(OLD) ->> key_name)::uuid
  );
  IF EXISTS (SELECT 1 FROM gate_decisions d WHERE d.id = decision_key AND d.outcome = 'block')
     AND NOT EXISTS (
       SELECT 1 FROM gate_impacts i
       WHERE i.gate_decision_id = decision_key AND i.action = 'block'
         AND (i.assertion_id IS NOT NULL OR i.effective_tier = 't1')
     ) THEN
    RAISE EXCEPTION 'blocking gate decision % requires an eligible T1 or assertion impact', decision_key
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER gate_decisions_block_eligibility
AFTER INSERT OR UPDATE OF outcome ON gate_decisions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_gate_block();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER gate_impacts_block_eligibility
AFTER INSERT OR UPDATE OR DELETE ON gate_impacts DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_gate_block();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_gate_exception_use()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_behavior_id uuid;
  candidate_digest text;
  run_repository_id uuid;
  run_pull_request_id uuid;
BEGIN
  IF NEW.gate_exception_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.dependency_claim_id IS NOT NULL THEN
    SELECT behavior_definition_id INTO target_behavior_id
    FROM dependency_claims WHERE id = NEW.dependency_claim_id;
  ELSE
    SELECT behavior_definition_id INTO target_behavior_id
    FROM assertions WHERE id = NEW.assertion_id;
  END IF;

  SELECT r.candidate_image_digest, r.github_repository_id, r.pull_request_id
    INTO candidate_digest, run_repository_id, run_pull_request_id
  FROM gate_decisions d
  JOIN replay_runs r ON r.id = d.replay_run_id
  WHERE d.id = NEW.gate_decision_id;

  IF NOT EXISTS (
    SELECT 1
    FROM gate_exceptions e
    JOIN breaking_change_impacts bi
      ON bi.breaking_change_plan_id = e.breaking_change_plan_id
     AND bi.consumer_id = NEW.consumer_id
    WHERE e.id = NEW.gate_exception_id
      AND e.organization_id = NEW.organization_id
      AND e.behavior_definition_id = target_behavior_id
      AND e.candidate_image_digest = candidate_digest
      AND e.status IN ('approved', 'used')
      AND now() BETWEEN e.valid_from AND e.valid_until
      AND (e.github_repository_id IS NULL OR e.github_repository_id = run_repository_id)
      AND (e.pull_request_id IS NULL OR e.pull_request_id = run_pull_request_id)
  ) THEN
    RAISE EXCEPTION 'gate exception is not valid for this exact candidate, behavior, and consumer'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER gate_impacts_exact_exception
AFTER INSERT OR UPDATE OF gate_exception_id, consumer_id, dependency_claim_id, assertion_id ON gate_impacts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_gate_exception_use();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_evaluation_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_scope evaluation_scope;
  parent_organization_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'evaluation_runs' THEN
    SELECT scope, organization_id INTO parent_scope, parent_organization_id
    FROM evaluation_datasets WHERE id = NEW.evaluation_dataset_id;
  ELSE
    SELECT scope, organization_id INTO parent_scope, parent_organization_id
    FROM evaluation_runs WHERE id = NEW.evaluation_run_id;
  END IF;
  IF NEW.scope IS DISTINCT FROM parent_scope
     OR NEW.organization_id IS DISTINCT FROM parent_organization_id THEN
    RAISE EXCEPTION 'evaluation scope and organization must match parent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER evaluation_runs_scope_consistency
BEFORE INSERT OR UPDATE OF scope, organization_id, evaluation_dataset_id ON evaluation_runs
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_evaluation_scope();--> statement-breakpoint
CREATE TRIGGER evaluation_metrics_scope_consistency
BEFORE INSERT OR UPDATE OF scope, organization_id, evaluation_run_id ON evaluation_metrics
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_evaluation_scope();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_prompt_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM evaluation_runs r
    WHERE r.prompt_version_id = NEW.id AND r.status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'prompt activation requires a successful evaluation run' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER prompt_versions_activation
BEFORE INSERT OR UPDATE OF status ON prompt_versions
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_prompt_activation();
