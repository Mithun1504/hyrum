DROP INDEX "gate_impacts_exception_single_use_uq";--> statement-breakpoint

-- One approval is consumed by one gate decision, not by only one row within
-- that decision. A plan may snapshot several affected consumers and may
-- produce both claim and assertion impacts for the same exact behavior.
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

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.gate_exception_id::text, 0));
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

  IF NOT FOUND AND NOT EXISTS (
    SELECT 1
    FROM gate_exceptions e
    JOIN gate_impacts prior
      ON prior.organization_id = e.organization_id
     AND prior.gate_exception_id = e.id
     AND prior.gate_decision_id = NEW.gate_decision_id
    WHERE e.id = NEW.gate_exception_id AND e.organization_id = NEW.organization_id
      AND e.status = 'used'
      AND e.behavior_definition_id = target_behavior_id
      AND e.candidate_image_digest = candidate_digest
      AND (e.github_repository_id IS NULL OR e.github_repository_id = run_repository_id)
      AND (e.pull_request_id IS NULL OR e.pull_request_id = run_pull_request_id)
      AND EXISTS (
        SELECT 1 FROM breaking_change_impacts bi
        WHERE bi.breaking_change_plan_id = e.breaking_change_plan_id
          AND bi.organization_id = e.organization_id AND bi.consumer_id = NEW.consumer_id
      )
  ) THEN
    RAISE EXCEPTION 'gate exception is not approved for this exact decision, candidate, behavior, and consumer'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
