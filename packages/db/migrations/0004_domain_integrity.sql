-- The baseline tenant-scoped foreign keys prevent cross-tenant references, but
-- several same-tenant graphs also need to agree on service/environment/operation.

-- PostgreSQL may reorder boolean expressions, so the original generic trigger's
-- `TG_TABLE_NAME = ... AND ... NEW.table_specific_column` predicates could read a
-- field that does not exist on another table's trigger record. Dispatch first,
-- then inspect only fields that exist on that table.
CREATE OR REPLACE FUNCTION public.hyrum_validate_domain_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'agents' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.service_environments e
        WHERE e.organization_id = NEW.organization_id
          AND e.id = NEW.environment_id
          AND e.api_service_id = NEW.api_service_id
      ) THEN
        RAISE EXCEPTION 'agent service/environment mismatch' USING ERRCODE = '23514';
      END IF;
    WHEN 'consumers' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.service_environments e
        WHERE e.organization_id = NEW.organization_id
          AND e.id = NEW.environment_id
          AND e.api_service_id = NEW.api_service_id
      ) THEN
        RAISE EXCEPTION 'consumer service/environment mismatch' USING ERRCODE = '23514';
      END IF;
    WHEN 'ingestion_batches' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.service_environments e
        JOIN public.agents a
          ON a.organization_id = e.organization_id
         AND a.environment_id = e.id
        WHERE e.organization_id = NEW.organization_id
          AND e.id = NEW.environment_id
          AND e.api_service_id = NEW.api_service_id
          AND a.id = NEW.agent_id
          AND a.api_service_id = NEW.api_service_id
      ) THEN
        RAISE EXCEPTION 'ingestion batch service/environment/agent mismatch' USING ERRCODE = '23514';
      END IF;
    WHEN 'capture_sessions' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.agents a
        JOIN public.consumers c
          ON c.organization_id = a.organization_id
         AND c.environment_id = a.environment_id
        JOIN public.ingestion_batches b
          ON b.organization_id = a.organization_id
         AND b.environment_id = a.environment_id
         AND b.agent_id = a.id
        WHERE a.organization_id = NEW.organization_id
          AND a.environment_id = NEW.environment_id
          AND a.id = NEW.agent_id
          AND c.id = NEW.consumer_id
          AND b.id = NEW.ingestion_batch_id
      ) THEN
        RAISE EXCEPTION 'capture session environment graph mismatch' USING ERRCODE = '23514';
      END IF;
    WHEN 'receipts' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.service_environments e
        JOIN public.consumers c
          ON c.organization_id = e.organization_id
         AND c.environment_id = e.id
        JOIN public.capture_sessions s
          ON s.organization_id = e.organization_id
         AND s.environment_id = e.id
         AND s.consumer_id = c.id
        WHERE e.organization_id = NEW.organization_id
          AND e.id = NEW.environment_id
          AND e.api_service_id = NEW.api_service_id
          AND c.id = NEW.consumer_id
          AND s.id = NEW.capture_session_id
      ) THEN
        RAISE EXCEPTION 'receipt service/environment/consumer/session mismatch' USING ERRCODE = '23514';
      END IF;
    WHEN 'dependency_claims' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.consumers c
        JOIN public.behavior_definitions b
          ON b.organization_id = c.organization_id
         AND b.api_service_id = c.api_service_id
        WHERE c.organization_id = NEW.organization_id
          AND c.id = NEW.consumer_id
          AND c.environment_id = NEW.environment_id
          AND c.api_service_id = NEW.api_service_id
          AND b.id = NEW.behavior_definition_id
      ) THEN
        RAISE EXCEPTION 'claim service/environment/consumer/behavior mismatch' USING ERRCODE = '23514';
      END IF;
    WHEN 'replay_corpora' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.service_environments e
        WHERE e.organization_id = NEW.organization_id
          AND e.id = NEW.environment_id
          AND e.api_service_id = NEW.api_service_id
      ) THEN
        RAISE EXCEPTION 'corpus service/environment mismatch' USING ERRCODE = '23514';
      END IF;
    WHEN 'replay_runs' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.service_environments e
        JOIN public.replay_corpora c
          ON c.organization_id = e.organization_id
         AND c.environment_id = e.id
         AND c.api_service_id = e.api_service_id
        JOIN public.replay_profiles p
          ON p.organization_id = e.organization_id
         AND p.api_service_id = e.api_service_id
        JOIN public.gate_policy_versions pv
          ON pv.organization_id = e.organization_id
        JOIN public.gate_policies gp
          ON gp.organization_id = pv.organization_id
         AND gp.id = pv.gate_policy_id
         AND gp.api_service_id = e.api_service_id
        WHERE e.organization_id = NEW.organization_id
          AND e.id = NEW.environment_id
          AND e.api_service_id = NEW.api_service_id
          AND c.id = NEW.replay_corpus_id
          AND p.id = NEW.replay_profile_id
          AND pv.id = NEW.gate_policy_version_id
      ) THEN
        RAISE EXCEPTION 'replay run input graph mismatch' USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'unsupported domain-alignment trigger table: %', TG_TABLE_NAME
        USING ERRCODE = '23514';
  END CASE;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.hyrum_validate_agent_config_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.redaction_policy_versions rp
    JOIN public.sampling_policy_versions sp
      ON sp.organization_id = rp.organization_id
     AND sp.api_service_id = rp.api_service_id
    WHERE rp.organization_id = NEW.organization_id
      AND rp.api_service_id = NEW.api_service_id
      AND rp.id = NEW.redaction_policy_version_id
      AND sp.id = NEW.sampling_policy_version_id
  ) THEN
    RAISE EXCEPTION 'agent redaction/sampling policy service mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER agents_config_alignment
BEFORE INSERT OR UPDATE OF organization_id, api_service_id, redaction_policy_version_id, sampling_policy_version_id
ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.hyrum_validate_agent_config_alignment();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.hyrum_validate_ingestion_batch_config_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.redaction_policy_versions rp
    JOIN public.sampling_policy_versions sp
      ON sp.organization_id = rp.organization_id
     AND sp.api_service_id = rp.api_service_id
    WHERE rp.organization_id = NEW.organization_id
      AND rp.api_service_id = NEW.api_service_id
      AND rp.id = NEW.redaction_policy_version_id
      AND sp.id = NEW.sampling_policy_version_id
  ) THEN
    RAISE EXCEPTION 'ingestion batch redaction/sampling policy service mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER ingestion_batches_config_alignment
BEFORE INSERT OR UPDATE OF organization_id, api_service_id, redaction_policy_version_id, sampling_policy_version_id
ON public.ingestion_batches
FOR EACH ROW EXECUTE FUNCTION public.hyrum_validate_ingestion_batch_config_alignment();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.hyrum_validate_behavior_definition_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.api_operations op
    WHERE op.organization_id = NEW.organization_id
      AND op.api_service_id = NEW.api_service_id
      AND op.id = NEW.api_operation_id
  ) THEN
    RAISE EXCEPTION 'behavior definition service/operation mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER behavior_definitions_domain_alignment
BEFORE INSERT OR UPDATE OF organization_id, api_service_id, api_operation_id
ON public.behavior_definitions
FOR EACH ROW EXECUTE FUNCTION public.hyrum_validate_behavior_definition_alignment();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.hyrum_validate_behavior_observation_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.service_environments env
    JOIN public.consumers consumer
      ON consumer.organization_id = env.organization_id
     AND consumer.api_service_id = env.api_service_id
     AND consumer.environment_id = env.id
    JOIN public.api_operations op
      ON op.organization_id = env.organization_id
     AND op.api_service_id = env.api_service_id
    JOIN public.behavior_definitions behavior
      ON behavior.organization_id = op.organization_id
     AND behavior.api_service_id = op.api_service_id
     AND behavior.api_operation_id = op.id
    WHERE env.organization_id = NEW.organization_id
      AND env.id = NEW.environment_id
      AND consumer.id = NEW.consumer_id
      AND op.id = NEW.api_operation_id
      AND behavior.id = NEW.behavior_definition_id
  ) THEN
    RAISE EXCEPTION 'behavior observation environment/consumer/operation/behavior mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER behavior_observations_domain_alignment
BEFORE INSERT OR UPDATE OF organization_id, environment_id, api_operation_id, consumer_id, behavior_definition_id
ON public.behavior_observations
FOR EACH ROW EXECUTE FUNCTION public.hyrum_validate_behavior_observation_alignment();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.hyrum_validate_corpus_item_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.replay_corpora corpus
    JOIN public.api_operations op
      ON op.organization_id = corpus.organization_id
     AND op.api_service_id = corpus.api_service_id
    JOIN public.consumers consumer
      ON consumer.organization_id = corpus.organization_id
     AND consumer.api_service_id = corpus.api_service_id
     AND consumer.environment_id = corpus.environment_id
    WHERE corpus.organization_id = NEW.organization_id
      AND corpus.id = NEW.replay_corpus_id
      AND op.id = NEW.api_operation_id
      AND consumer.id = NEW.consumer_id
  ) THEN
    RAISE EXCEPTION 'corpus item corpus/operation/consumer mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.behavior_definition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.replay_corpora corpus
    JOIN public.behavior_definitions behavior
      ON behavior.organization_id = corpus.organization_id
     AND behavior.api_service_id = corpus.api_service_id
    WHERE corpus.organization_id = NEW.organization_id
      AND corpus.id = NEW.replay_corpus_id
      AND behavior.id = NEW.behavior_definition_id
      AND behavior.api_operation_id = NEW.api_operation_id
  ) THEN
    RAISE EXCEPTION 'corpus item behavior does not belong to its corpus service and operation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.assertion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.replay_corpora corpus
    JOIN public.assertions assertion
      ON assertion.organization_id = corpus.organization_id
     AND assertion.api_service_id = corpus.api_service_id
    JOIN public.behavior_definitions behavior
      ON behavior.organization_id = assertion.organization_id
     AND behavior.id = assertion.behavior_definition_id
     AND behavior.api_service_id = corpus.api_service_id
    WHERE corpus.organization_id = NEW.organization_id
      AND corpus.id = NEW.replay_corpus_id
      AND assertion.id = NEW.assertion_id
      AND behavior.api_operation_id = NEW.api_operation_id
      AND (
        NEW.behavior_definition_id IS NULL
        OR NEW.behavior_definition_id = assertion.behavior_definition_id
      )
  ) THEN
    RAISE EXCEPTION 'corpus item assertion does not belong to its corpus service, operation, and behavior'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER corpus_items_domain_alignment
BEFORE INSERT OR UPDATE OF organization_id, replay_corpus_id, api_operation_id, consumer_id, behavior_definition_id, assertion_id
ON public.corpus_items
FOR EACH ROW EXECUTE FUNCTION public.hyrum_validate_corpus_item_alignment();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.hyrum_validate_replay_delta_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.replay_runs run
    JOIN public.api_operations op
      ON op.organization_id = run.organization_id
     AND op.api_service_id = run.api_service_id
    WHERE run.organization_id = NEW.organization_id
      AND run.id = NEW.replay_run_id
      AND op.id = NEW.api_operation_id
  ) THEN
    RAISE EXCEPTION 'replay delta run/operation mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.before_behavior_definition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.replay_runs run
    JOIN public.behavior_definitions behavior
      ON behavior.organization_id = run.organization_id
     AND behavior.api_service_id = run.api_service_id
    WHERE run.organization_id = NEW.organization_id
      AND run.id = NEW.replay_run_id
      AND behavior.id = NEW.before_behavior_definition_id
      AND behavior.api_operation_id = NEW.api_operation_id
      AND behavior.kind = NEW.kind
  ) THEN
    RAISE EXCEPTION 'replay delta before-behavior does not match its run, operation, and kind'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.after_behavior_definition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.replay_runs run
    JOIN public.behavior_definitions behavior
      ON behavior.organization_id = run.organization_id
     AND behavior.api_service_id = run.api_service_id
    WHERE run.organization_id = NEW.organization_id
      AND run.id = NEW.replay_run_id
      AND behavior.id = NEW.after_behavior_definition_id
      AND behavior.api_operation_id = NEW.api_operation_id
      AND behavior.kind = NEW.kind
  ) THEN
    RAISE EXCEPTION 'replay delta after-behavior does not match its run, operation, and kind'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.receipt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.replay_runs run
    JOIN public.receipts receipt
      ON receipt.organization_id = run.organization_id
     AND receipt.api_service_id = run.api_service_id
     AND receipt.environment_id = run.environment_id
    WHERE run.organization_id = NEW.organization_id
      AND run.id = NEW.replay_run_id
      AND receipt.id = NEW.receipt_id
      AND receipt.receipt_type = 'replay_delta'
  ) THEN
    RAISE EXCEPTION 'replay delta receipt does not match its run service/environment or type'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER replay_deltas_domain_alignment
BEFORE INSERT OR UPDATE OF organization_id, replay_run_id, api_operation_id, before_behavior_definition_id, after_behavior_definition_id, kind, receipt_id
ON public.replay_deltas
FOR EACH ROW EXECUTE FUNCTION public.hyrum_validate_replay_delta_alignment();--> statement-breakpoint

-- The shared trigger created in 0003 is attached to heterogeneous tables. Read
-- its dynamic trigger row through JSON so fields absent from another table do
-- not raise `record NEW has no field` before the relevant branch is selected.
CREATE OR REPLACE FUNCTION public.hyrum_validate_domain_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  target_org_id uuid := (row_data ->> 'organization_id')::uuid;
  target_service_id uuid := (row_data ->> 'api_service_id')::uuid;
  target_environment_id uuid := (row_data ->> 'environment_id')::uuid;
BEGIN
  IF TG_TABLE_NAME = 'agents' AND NOT EXISTS (
    SELECT 1 FROM public.service_environments e
    WHERE e.organization_id = target_org_id AND e.id = target_environment_id
      AND e.api_service_id = target_service_id
  ) THEN RAISE EXCEPTION 'agent service/environment mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'consumers' AND NOT EXISTS (
    SELECT 1 FROM public.service_environments e
    WHERE e.organization_id = target_org_id AND e.id = target_environment_id
      AND e.api_service_id = target_service_id
  ) THEN RAISE EXCEPTION 'consumer service/environment mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'ingestion_batches' AND NOT EXISTS (
    SELECT 1 FROM public.service_environments e
    JOIN public.agents a ON a.organization_id = e.organization_id AND a.environment_id = e.id
    WHERE e.organization_id = target_org_id AND e.id = target_environment_id
      AND e.api_service_id = target_service_id AND a.id = (row_data ->> 'agent_id')::uuid
      AND a.api_service_id = target_service_id
  ) THEN RAISE EXCEPTION 'ingestion batch service/environment/agent mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'capture_sessions' AND NOT EXISTS (
    SELECT 1 FROM public.agents a
    JOIN public.consumers c ON c.organization_id = a.organization_id AND c.environment_id = a.environment_id
    JOIN public.ingestion_batches b ON b.organization_id = a.organization_id
      AND b.environment_id = a.environment_id AND b.agent_id = a.id
    WHERE a.organization_id = target_org_id AND a.environment_id = target_environment_id
      AND a.id = (row_data ->> 'agent_id')::uuid
      AND c.id = (row_data ->> 'consumer_id')::uuid
      AND b.id = (row_data ->> 'ingestion_batch_id')::uuid
  ) THEN RAISE EXCEPTION 'capture session environment graph mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'receipts' AND NOT EXISTS (
    SELECT 1 FROM public.service_environments e
    JOIN public.consumers c ON c.organization_id = e.organization_id AND c.environment_id = e.id
    JOIN public.capture_sessions s ON s.organization_id = e.organization_id
      AND s.environment_id = e.id AND s.consumer_id = c.id
    WHERE e.organization_id = target_org_id AND e.id = target_environment_id
      AND e.api_service_id = target_service_id AND c.id = (row_data ->> 'consumer_id')::uuid
      AND s.id = (row_data ->> 'capture_session_id')::uuid
  ) THEN RAISE EXCEPTION 'receipt service/environment/consumer/session mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'dependency_claims' AND NOT EXISTS (
    SELECT 1 FROM public.consumers c
    JOIN public.behavior_definitions b ON b.organization_id = c.organization_id
      AND b.api_service_id = c.api_service_id
    WHERE c.organization_id = target_org_id AND c.id = (row_data ->> 'consumer_id')::uuid
      AND c.environment_id = target_environment_id AND c.api_service_id = target_service_id
      AND b.id = (row_data ->> 'behavior_definition_id')::uuid
  ) THEN RAISE EXCEPTION 'claim service/environment/consumer/behavior mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'replay_corpora' AND NOT EXISTS (
    SELECT 1 FROM public.service_environments e
    WHERE e.organization_id = target_org_id AND e.id = target_environment_id
      AND e.api_service_id = target_service_id
  ) THEN RAISE EXCEPTION 'corpus service/environment mismatch' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'replay_runs' AND NOT EXISTS (
    SELECT 1 FROM public.service_environments e
    JOIN public.replay_corpora c ON c.organization_id = e.organization_id
      AND c.environment_id = e.id AND c.api_service_id = e.api_service_id
    JOIN public.replay_profiles p ON p.organization_id = e.organization_id
      AND p.api_service_id = e.api_service_id
    JOIN public.gate_policy_versions pv ON pv.organization_id = e.organization_id
    JOIN public.gate_policies gp ON gp.organization_id = pv.organization_id
      AND gp.id = pv.gate_policy_id AND gp.api_service_id = e.api_service_id
    WHERE e.organization_id = target_org_id AND e.id = target_environment_id
      AND e.api_service_id = target_service_id
      AND c.id = (row_data ->> 'replay_corpus_id')::uuid
      AND p.id = (row_data ->> 'replay_profile_id')::uuid
      AND pv.id = (row_data ->> 'gate_policy_version_id')::uuid
  ) THEN RAISE EXCEPTION 'replay run input graph mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
