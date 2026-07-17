CREATE OR REPLACE FUNCTION hyrum_seed_organization_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  INSERT INTO scheduled_tasks (
    organization_id, task_type, schedule_expression, timezone, next_run_at, idempotency_seed
  ) VALUES
    (NEW.id, 'refresh_ledger_freshness', '1 hour', 'UTC', now(), 'ledger-freshness:' || NEW.id::text),
    (NEW.id, 'enforce_object_retention', '1 hour', 'UTC', now(), 'object-retention:' || NEW.id::text)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS organizations_seed_maintenance_trg ON organizations;--> statement-breakpoint
CREATE TRIGGER organizations_seed_maintenance_trg
AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION hyrum_seed_organization_maintenance();--> statement-breakpoint
INSERT INTO scheduled_tasks (
  organization_id, task_type, schedule_expression, timezone, next_run_at, idempotency_seed
)
SELECT id, task_type, '1 hour', 'UTC', now(), seed || id::text
FROM organizations
CROSS JOIN (VALUES
  ('refresh_ledger_freshness', 'ledger-freshness:'),
  ('enforce_object_retention', 'object-retention:')
) AS tasks(task_type, seed)
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_dispatch_scheduled_tasks(claim_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  dispatched integer;
BEGIN
  IF claim_limit < 1 OR claim_limit > 500 THEN
    RAISE EXCEPTION 'claim_limit must be between 1 and 500';
  END IF;
  WITH due AS (
    SELECT id, organization_id, api_service_id, task_type, schedule_expression,
           idempotency_seed, next_run_at
    FROM scheduled_tasks
    WHERE enabled AND next_run_at <= now()
    ORDER BY next_run_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT claim_limit
  ), enqueued AS (
    INSERT INTO jobs (
      organization_id, type, payload, status, priority, max_attempts, run_after,
      idempotency_key, concurrency_key
    )
    SELECT organization_id, task_type,
           jsonb_build_object('apiServiceId', api_service_id, 'scheduledTaskId', id),
           'pending', -10, 5, now(),
           idempotency_seed || ':' || extract(epoch FROM next_run_at)::bigint::text,
           'maintenance:' || coalesce(organization_id::text, 'platform') || ':' || task_type
    FROM due
    ON CONFLICT DO NOTHING
    RETURNING id
  ), advanced AS (
    UPDATE scheduled_tasks task
    SET last_enqueued_at = now(),
        next_run_at = greatest(task.next_run_at, now()) + task.schedule_expression::interval,
        updated_at = now()
    FROM due
    WHERE task.id = due.id
    RETURNING task.id
  )
  SELECT count(*)::integer INTO dispatched FROM advanced;
  RETURN dispatched;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_dispatch_scheduled_tasks(integer) FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION hyrum_dispatch_scheduled_tasks(integer) TO %I', current_user);
END
$$;
