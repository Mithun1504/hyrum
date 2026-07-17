ALTER TABLE "dependency_claims" DROP CONSTRAINT "dependency_claims_t3_confidence_ck";--> statement-breakpoint
DROP INDEX "evaluation_datasets_digest_uq";--> statement-breakpoint
DROP INDEX "ci_runner_sessions_active_run_uq";--> statement-breakpoint
DROP INDEX "notification_deliveries_pending_idx";--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "completeness" SET DATA TYPE "public"."session_completeness" USING "completeness"::"public"."session_completeness";--> statement-breakpoint
CREATE INDEX "ci_runner_sessions_active_run_idx" ON "ci_runner_sessions" USING btree ("replay_run_id") WHERE "ci_runner_sessions"."consumed_at" is null and "ci_runner_sessions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_idx" ON "notification_deliveries" USING btree ("next_attempt_at") WHERE "notification_deliveries"."status" in ('queued', 'failed');--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_confidence_tier_ck" CHECK ("dependency_claims"."tier" = 't2' or "dependency_claims"."confidence" is null);--> statement-breakpoint

-- PostgreSQL policies are not inherited by partitions when a child is addressed directly.
-- Harden every tenant partition, including DEFAULT partitions used between monthly rollovers.
DO $$
DECLARE
  partition_name text;
  tenant_partitions text[] := ARRAY[
    'audit_events_2026_07', 'audit_events_2026_08', 'audit_events_2026_09',
    'audit_events_default', 'behavior_observations_2026_07',
    'behavior_observations_2026_08', 'behavior_observations_2026_09',
    'behavior_observations_default'
  ];
BEGIN
  FOREACH partition_name IN ARRAY tenant_partitions LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', partition_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = hyrum_current_organization_id()) WITH CHECK (organization_id = hyrum_current_organization_id())',
      partition_name
    );
  END LOOP;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_tenant_retention()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  configured_ttl smallint;
  retention_limit smallint;
BEGIN
  IF TG_TABLE_NAME = 'organization_settings' THEN
    SELECT retention_days INTO retention_limit FROM organizations WHERE id = NEW.organization_id;
    configured_ttl := NEW.default_receipt_ttl_days;
  ELSE
    SELECT default_receipt_ttl_days INTO configured_ttl
    FROM organization_settings WHERE organization_id = NEW.id;
    retention_limit := NEW.retention_days;
  END IF;
  IF configured_ttl IS NOT NULL AND configured_ttl > retention_limit THEN
    RAISE EXCEPTION 'default receipt TTL (%) exceeds organization retention (%)', configured_ttl, retention_limit
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER organization_settings_retention_limit
BEFORE INSERT OR UPDATE OF organization_id, default_receipt_ttl_days ON organization_settings
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_tenant_retention();--> statement-breakpoint
CREATE TRIGGER organizations_retention_limit
BEFORE UPDATE OF retention_days ON organizations
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_tenant_retention();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_assertion_future_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('active', 'expiring') AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'active assertion expiry must be in the future' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER assertions_future_expiry
BEFORE INSERT OR UPDATE OF status, expires_at ON assertions
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_assertion_future_expiry();--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_breaking_change_plan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE assertion_expiry timestamptz;
BEGIN
  SELECT expires_at INTO assertion_expiry FROM assertions
  WHERE id = NEW.assertion_id AND organization_id = NEW.organization_id;
  IF NEW.status IN ('scheduled', 'communication_ready')
     AND (NEW.planned_for <= now() OR NEW.planned_for > assertion_expiry) THEN
    RAISE EXCEPTION 'scheduled break must be in the future and not exceed assertion expiry'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_validate_ci_runner_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.consumed_at IS NULL AND NEW.revoked_at IS NULL AND NEW.expires_at > now() THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.replay_run_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM ci_runner_sessions s
      WHERE s.replay_run_id = NEW.replay_run_id
        AND s.id <> NEW.id
        AND s.consumed_at IS NULL
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
    ) THEN
      RAISE EXCEPTION 'replay run % already has an active CI runner session', NEW.replay_run_id
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER ci_runner_sessions_one_live_session
BEFORE INSERT OR UPDATE OF replay_run_id, expires_at, consumed_at, revoked_at ON ci_runner_sessions
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_ci_runner_session();--> statement-breakpoint

-- An active T1 claim is valid only while complete, available, same-key echo evidence exists.
CREATE OR REPLACE FUNCTION hyrum_validate_active_t1_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_id uuid;
  invalid_claim_id uuid;
BEGIN
  tenant_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  SELECT c.id INTO invalid_claim_id
  FROM dependency_claims c
  WHERE c.organization_id = tenant_id
    AND c.status = 'active'
    AND c.tier = 't1'
    AND NOT EXISTS (
      SELECT 1
      FROM claim_evidence ce
      JOIN receipts r
        ON r.organization_id = ce.organization_id AND r.id = ce.receipt_id
      JOIN capture_sessions cs
        ON cs.organization_id = r.organization_id AND cs.id = r.capture_session_id
      JOIN redaction_policy_versions rp
        ON rp.organization_id = r.organization_id AND rp.id = r.redaction_policy_version_id
      JOIN organization_key_versions kv
        ON kv.organization_id = ce.organization_id AND kv.id = ce.structural_hmac_key_version_id
      WHERE ce.organization_id = c.organization_id
        AND ce.dependency_claim_id = c.id
        AND ce.evidence_role = 'primary'
        AND r.receipt_type = 't1_echo'
        AND r.availability_status = 'available'
        AND r.expires_at > now()
        AND r.completeness = 'complete'
        AND cs.completeness = 'complete'
        AND r.consumer_id = c.consumer_id
        AND r.environment_id = c.environment_id
        AND cs.consumer_id = c.consumer_id
        AND cs.environment_id = c.environment_id
        AND ce.request_sequence_no > ce.response_sequence_no
        AND ce.response_sequence_no BETWEEN r.sequence_start AND r.sequence_end
        AND ce.request_sequence_no BETWEEN r.sequence_start AND r.sequence_end
        AND ce.value_hmac IS NOT NULL
        AND ce.structural_hmac_key_version_id = cs.structural_hmac_key_version_id
        AND ce.structural_hmac_key_version_id = rp.structural_hmac_key_version_id
        AND kv.purpose = 'structural_hmac'
        AND kv.status IN ('active', 'retiring')
    )
  LIMIT 1;
  IF invalid_claim_id IS NOT NULL THEN
    RAISE EXCEPTION 'active T1 claim % requires complete, available, same-key echo evidence', invalid_claim_id
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint
DROP TRIGGER dependency_claims_t1_evidence ON dependency_claims;--> statement-breakpoint
DROP TRIGGER claim_evidence_t1_evidence ON claim_evidence;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dependency_claims_t1_evidence
AFTER INSERT OR UPDATE OR DELETE ON dependency_claims
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER claim_evidence_t1_evidence
AFTER INSERT OR UPDATE OR DELETE ON claim_evidence
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER receipts_t1_evidence
AFTER INSERT OR UPDATE OR DELETE ON receipts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER capture_sessions_t1_evidence
AFTER INSERT OR UPDATE OR DELETE ON capture_sessions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER redaction_policy_versions_t1_evidence
AFTER INSERT OR UPDATE OR DELETE ON redaction_policy_versions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER organization_key_versions_t1_evidence
AFTER INSERT OR UPDATE OR DELETE ON organization_key_versions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hyrum_validate_active_t1_claim();--> statement-breakpoint

-- Validate the redundant service/environment columns used for fast tenant-scoped queries.
CREATE OR REPLACE FUNCTION hyrum_validate_domain_alignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'agents' AND NOT EXISTS (
    SELECT 1 FROM service_environments e WHERE e.organization_id = NEW.organization_id
      AND e.id = NEW.environment_id AND e.api_service_id = NEW.api_service_id
  ) THEN RAISE EXCEPTION 'agent service/environment mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'consumers' AND NOT EXISTS (
    SELECT 1 FROM service_environments e WHERE e.organization_id = NEW.organization_id
      AND e.id = NEW.environment_id AND e.api_service_id = NEW.api_service_id
  ) THEN RAISE EXCEPTION 'consumer service/environment mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'ingestion_batches' AND NOT EXISTS (
    SELECT 1 FROM service_environments e JOIN agents a
      ON a.organization_id = e.organization_id AND a.environment_id = e.id
    WHERE e.organization_id = NEW.organization_id AND e.id = NEW.environment_id
      AND e.api_service_id = NEW.api_service_id AND a.id = NEW.agent_id
      AND a.api_service_id = NEW.api_service_id
  ) THEN RAISE EXCEPTION 'ingestion batch service/environment/agent mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'capture_sessions' AND NOT EXISTS (
    SELECT 1 FROM agents a JOIN consumers c ON c.organization_id = a.organization_id
      AND c.environment_id = a.environment_id
    JOIN ingestion_batches b ON b.organization_id = a.organization_id
      AND b.environment_id = a.environment_id AND b.agent_id = a.id
    WHERE a.organization_id = NEW.organization_id AND a.environment_id = NEW.environment_id
      AND a.id = NEW.agent_id AND c.id = NEW.consumer_id AND b.id = NEW.ingestion_batch_id
  ) THEN RAISE EXCEPTION 'capture session environment graph mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'receipts' AND NOT EXISTS (
    SELECT 1 FROM service_environments e
    JOIN consumers c ON c.organization_id = e.organization_id AND c.environment_id = e.id
    JOIN capture_sessions s ON s.organization_id = e.organization_id
      AND s.environment_id = e.id AND s.consumer_id = c.id
    WHERE e.organization_id = NEW.organization_id AND e.id = NEW.environment_id
      AND e.api_service_id = NEW.api_service_id AND c.id = NEW.consumer_id
      AND s.id = NEW.capture_session_id
  ) THEN RAISE EXCEPTION 'receipt service/environment/consumer/session mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'dependency_claims' AND NOT EXISTS (
    SELECT 1 FROM consumers c
    JOIN behavior_definitions b ON b.organization_id = c.organization_id
      AND b.api_service_id = c.api_service_id
    WHERE c.organization_id = NEW.organization_id AND c.id = NEW.consumer_id
      AND c.environment_id = NEW.environment_id AND c.api_service_id = NEW.api_service_id
      AND b.id = NEW.behavior_definition_id
  ) THEN RAISE EXCEPTION 'claim service/environment/consumer/behavior mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'replay_corpora' AND NOT EXISTS (
    SELECT 1 FROM service_environments e WHERE e.organization_id = NEW.organization_id
      AND e.id = NEW.environment_id AND e.api_service_id = NEW.api_service_id
  ) THEN RAISE EXCEPTION 'corpus service/environment mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'replay_runs' AND NOT EXISTS (
    SELECT 1 FROM service_environments e
    JOIN replay_corpora c ON c.organization_id = e.organization_id
      AND c.environment_id = e.id AND c.api_service_id = e.api_service_id
    JOIN replay_profiles p ON p.organization_id = e.organization_id
      AND p.api_service_id = e.api_service_id
    JOIN gate_policy_versions pv ON pv.organization_id = e.organization_id
    JOIN gate_policies gp ON gp.organization_id = pv.organization_id
      AND gp.id = pv.gate_policy_id AND gp.api_service_id = e.api_service_id
    WHERE e.organization_id = NEW.organization_id AND e.id = NEW.environment_id
      AND e.api_service_id = NEW.api_service_id AND c.id = NEW.replay_corpus_id
      AND p.id = NEW.replay_profile_id AND pv.id = NEW.gate_policy_version_id
  ) THEN RAISE EXCEPTION 'replay run input graph mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER agents_domain_alignment BEFORE INSERT OR UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint
CREATE TRIGGER consumers_domain_alignment BEFORE INSERT OR UPDATE ON consumers
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint
CREATE TRIGGER ingestion_batches_domain_alignment BEFORE INSERT OR UPDATE ON ingestion_batches
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint
CREATE TRIGGER capture_sessions_domain_alignment BEFORE INSERT OR UPDATE ON capture_sessions
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint
CREATE TRIGGER receipts_domain_alignment BEFORE INSERT OR UPDATE ON receipts
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint
CREATE TRIGGER dependency_claims_domain_alignment BEFORE INSERT OR UPDATE ON dependency_claims
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint
CREATE TRIGGER replay_corpora_domain_alignment BEFORE INSERT OR UPDATE ON replay_corpora
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint
CREATE TRIGGER replay_runs_domain_alignment BEFORE INSERT OR UPDATE ON replay_runs
FOR EACH ROW EXECUTE FUNCTION hyrum_validate_domain_alignment();--> statement-breakpoint

-- A blocking decision must be backed by a stable, matched and currently eligible impact.
CREATE OR REPLACE FUNCTION hyrum_validate_gate_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  decision_key uuid;
BEGIN
  decision_key := CASE
    WHEN TG_TABLE_NAME = 'gate_decisions' THEN COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid)
    ELSE COALESCE((to_jsonb(NEW)->>'gate_decision_id')::uuid, (to_jsonb(OLD)->>'gate_decision_id')::uuid)
  END;
  IF EXISTS (SELECT 1 FROM gate_decisions d WHERE d.id = decision_key AND d.outcome = 'block')
     AND NOT EXISTS (
       SELECT 1
       FROM gate_impacts i
       JOIN gate_decisions d ON d.id = i.gate_decision_id AND d.organization_id = i.organization_id
       JOIN replay_deltas rd ON rd.id = i.replay_delta_id AND rd.organization_id = i.organization_id
         AND rd.replay_run_id = d.replay_run_id AND rd.stability = 'stable'
       LEFT JOIN dependency_claims c ON c.id = i.dependency_claim_id AND c.organization_id = i.organization_id
       LEFT JOIN ledger_entries le ON le.dependency_claim_id = c.id AND le.organization_id = c.organization_id
       LEFT JOIN delta_claim_matches dcm ON dcm.replay_delta_id = rd.id
         AND dcm.dependency_claim_id = c.id AND dcm.organization_id = i.organization_id
         AND dcm.matched AND dcm.ineligibility_reason IS NULL
       LEFT JOIN assertions a ON a.id = i.assertion_id AND a.organization_id = i.organization_id
       LEFT JOIN delta_assertion_matches dam ON dam.replay_delta_id = rd.id
         AND dam.assertion_id = a.id AND dam.organization_id = i.organization_id
         AND dam.matched AND dam.ineligibility_reason IS NULL
       WHERE i.gate_decision_id = decision_key AND i.action = 'block'
         AND i.gate_exception_id IS NULL
         AND (
           (c.id IS NOT NULL AND i.effective_tier = 't1' AND c.tier = 't1'
             AND c.status = 'active' AND c.deterministic_eligible
             AND c.effective_from <= d.evaluated_at
             AND (c.effective_until IS NULL OR c.effective_until > d.evaluated_at)
             AND le.freshness_status IN ('fresh', 'aging') AND dcm.id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM claim_evidence ce
               JOIN receipts r
                 ON r.id = ce.receipt_id AND r.organization_id = ce.organization_id
               JOIN capture_sessions cs
                 ON cs.id = r.capture_session_id AND cs.organization_id = r.organization_id
               JOIN redaction_policy_versions rp
                 ON rp.id = r.redaction_policy_version_id AND rp.organization_id = r.organization_id
               JOIN organization_key_versions kv
                 ON kv.id = ce.structural_hmac_key_version_id
                AND kv.organization_id = ce.organization_id
               WHERE ce.dependency_claim_id = c.id AND ce.evidence_role = 'primary'
                 AND r.id = i.receipt_id AND r.receipt_type = 't1_echo'
                 AND r.availability_status = 'available' AND r.expires_at > d.evaluated_at
                 AND r.completeness = 'complete'
                 AND cs.completeness = 'complete'
                 AND ce.request_sequence_no > ce.response_sequence_no
                 AND ce.response_sequence_no BETWEEN r.sequence_start AND r.sequence_end
                 AND ce.request_sequence_no BETWEEN r.sequence_start AND r.sequence_end
                 AND ce.value_hmac IS NOT NULL
                 AND ce.structural_hmac_key_version_id = cs.structural_hmac_key_version_id
                 AND ce.structural_hmac_key_version_id = rp.structural_hmac_key_version_id
                 AND kv.purpose = 'structural_hmac' AND kv.status IN ('active', 'retiring')
             ))
           OR
           (a.id IS NOT NULL AND a.status IN ('active', 'expiring')
             AND a.starts_at <= d.evaluated_at AND a.expires_at > d.evaluated_at
             AND dam.id IS NOT NULL
             AND (
               a.scope = 'all_consumers'
               OR EXISTS (
                 SELECT 1 FROM assertion_consumers ac
                 WHERE ac.organization_id = a.organization_id
                   AND ac.assertion_id = a.id AND ac.consumer_id = i.consumer_id
               )
             ))
         )
     ) THEN
    RAISE EXCEPTION 'blocking gate decision % lacks a stable, matched, eligible T1 or assertion impact', decision_key
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_consume_gate_exception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_behavior_id uuid;
  candidate_digest text;
  run_repository_id uuid;
  run_pull_request_id uuid;
BEGIN
  IF NEW.gate_exception_id IS NULL OR
     (TG_OP = 'UPDATE' AND NEW.gate_exception_id IS NOT DISTINCT FROM OLD.gate_exception_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.action = 'block' THEN
    RAISE EXCEPTION 'a gate exception must reduce, not preserve, a blocking impact' USING ERRCODE = '23514';
  END IF;
  IF NEW.dependency_claim_id IS NOT NULL THEN
    SELECT behavior_definition_id INTO target_behavior_id FROM dependency_claims
    WHERE id = NEW.dependency_claim_id AND organization_id = NEW.organization_id;
  ELSE
    SELECT behavior_definition_id INTO target_behavior_id FROM assertions
    WHERE id = NEW.assertion_id AND organization_id = NEW.organization_id;
  END IF;
  SELECT r.candidate_image_digest, r.github_repository_id, r.pull_request_id
    INTO candidate_digest, run_repository_id, run_pull_request_id
  FROM gate_decisions d JOIN replay_runs r ON r.id = d.replay_run_id
  WHERE d.id = NEW.gate_decision_id AND d.organization_id = NEW.organization_id;
  UPDATE gate_exceptions e SET status = 'used', used_at = now()
  WHERE e.id = NEW.gate_exception_id AND e.organization_id = NEW.organization_id
    AND e.status = 'approved' AND now() BETWEEN e.valid_from AND e.valid_until
    AND e.behavior_definition_id = target_behavior_id
    AND e.candidate_image_digest = candidate_digest
    AND (e.github_repository_id IS NULL OR e.github_repository_id = run_repository_id)
    AND (e.pull_request_id IS NULL OR e.pull_request_id = run_pull_request_id)
    AND EXISTS (
      SELECT 1 FROM breaking_change_impacts bi
      WHERE bi.breaking_change_plan_id = e.breaking_change_plan_id
        AND bi.organization_id = e.organization_id AND bi.consumer_id = NEW.consumer_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gate exception is not approved for this exact candidate, behavior, and consumer'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER gate_impacts_exact_exception ON gate_impacts;--> statement-breakpoint
CREATE TRIGGER gate_impacts_exact_exception
BEFORE INSERT OR UPDATE OF gate_exception_id, consumer_id, dependency_claim_id, assertion_id ON gate_impacts
FOR EACH ROW EXECUTE FUNCTION hyrum_consume_gate_exception();
