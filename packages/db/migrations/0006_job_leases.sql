-- Worker access to forced-RLS jobs is restricted to these lease-token-guarded operations.
-- Deployments using separate migration and runtime roles must explicitly grant EXECUTE
-- on these functions to the worker role; no table-level RLS bypass is required.
CREATE OR REPLACE FUNCTION hyrum_claim_jobs(
  requested_lease_owner text,
  requested_limit integer DEFAULT 10,
  requested_lease_duration interval DEFAULT interval '60 seconds'
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  type text,
  payload jsonb,
  attempts integer,
  max_attempts integer,
  lease_owner text,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF requested_lease_owner IS NULL OR btrim(requested_lease_owner) = '' OR length(requested_lease_owner) > 250 THEN
    RAISE EXCEPTION 'invalid lease owner' USING ERRCODE = '22023';
  END IF;
  IF requested_limit IS NULL OR requested_limit < 1 OR requested_limit > 100 THEN
    RAISE EXCEPTION 'claim limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;
  IF requested_lease_duration < interval '5 seconds' OR requested_lease_duration > interval '1 hour' THEN
    RAISE EXCEPTION 'lease duration must be between 5 seconds and 1 hour' USING ERRCODE = '22023';
  END IF;

  -- A crash during the last permitted attempt must not leave a running row forever.
  UPDATE public.jobs AS exhausted
  SET status = 'dead',
      lease_owner = NULL,
      lease_expires_at = NULL,
      completed_at = clock_timestamp(),
      last_error_code = 'lease_expired',
      last_error_summary = 'Worker lease expired after the final permitted attempt',
      updated_at = clock_timestamp()
  WHERE exhausted.status = 'running'
    AND exhausted.lease_expires_at <= clock_timestamp()
    AND exhausted.attempts >= exhausted.max_attempts;

  RETURN QUERY
  WITH candidates AS (
    SELECT candidate.id
    FROM public.jobs AS candidate
    WHERE candidate.attempts < candidate.max_attempts
      AND (
        (candidate.status = 'pending' AND candidate.run_after <= clock_timestamp())
        OR (candidate.status = 'running' AND candidate.lease_expires_at <= clock_timestamp())
      )
    ORDER BY candidate.priority DESC, candidate.run_after ASC, candidate.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT requested_limit
  )
  UPDATE public.jobs AS claimed
  SET status = 'running',
      lease_owner = requested_lease_owner,
      lease_expires_at = clock_timestamp() + requested_lease_duration,
      attempts = claimed.attempts + 1,
      started_at = COALESCE(claimed.started_at, clock_timestamp()),
      completed_at = NULL,
      updated_at = clock_timestamp()
  FROM candidates
  WHERE claimed.id = candidates.id
  RETURNING claimed.id, claimed.organization_id, claimed.type, claimed.payload,
            claimed.attempts, claimed.max_attempts, claimed.lease_owner,
            claimed.lease_expires_at;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_renew_job_lease(
  requested_job_id uuid,
  requested_lease_owner text,
  requested_lease_duration interval DEFAULT interval '60 seconds'
)
RETURNS TABLE (lease_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF requested_lease_duration < interval '5 seconds' OR requested_lease_duration > interval '1 hour' THEN
    RAISE EXCEPTION 'lease duration must be between 5 seconds and 1 hour' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  UPDATE public.jobs AS job
  SET lease_expires_at = clock_timestamp() + requested_lease_duration,
      updated_at = clock_timestamp()
  WHERE job.id = requested_job_id
    AND job.status = 'running'
    AND job.lease_owner = requested_lease_owner
    AND job.lease_expires_at > clock_timestamp()
  RETURNING job.lease_expires_at;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_complete_job(
  requested_job_id uuid,
  requested_lease_owner text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH completed AS (
    UPDATE public.jobs AS job
    SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL,
        completed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE job.id = requested_job_id
      AND job.status = 'running'
      AND job.lease_owner = requested_lease_owner
      AND job.lease_expires_at > clock_timestamp()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM completed)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION hyrum_fail_job(
  requested_job_id uuid,
  requested_lease_owner text,
  requested_error_code text,
  requested_error_summary text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH failed AS (
    UPDATE public.jobs AS job
    SET status = CASE WHEN job.attempts >= job.max_attempts THEN 'dead'::public.job_status ELSE 'pending'::public.job_status END,
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error_code = left(COALESCE(requested_error_code, 'Error'), 100),
        last_error_summary = left(COALESCE(requested_error_summary, 'Unknown job failure'), 2000),
        run_after = CASE WHEN job.attempts >= job.max_attempts THEN job.run_after
                         ELSE clock_timestamp() + make_interval(secs => LEAST(power(2, LEAST(job.attempts, 9))::integer, 300)) END,
        completed_at = CASE WHEN job.attempts >= job.max_attempts THEN clock_timestamp() ELSE NULL END,
        updated_at = clock_timestamp()
    WHERE job.id = requested_job_id
      AND job.status = 'running'
      AND job.lease_owner = requested_lease_owner
      AND job.lease_expires_at > clock_timestamp()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM failed)
$$;--> statement-breakpoint

COMMENT ON FUNCTION hyrum_claim_jobs(text, integer, interval) IS
  'Claims due or expired jobs across FORCE RLS using a unique worker lease token.';--> statement-breakpoint
COMMENT ON FUNCTION hyrum_renew_job_lease(uuid, text, interval) IS
  'Renews only a currently live job lease owned by the supplied token.';--> statement-breakpoint
COMMENT ON FUNCTION hyrum_complete_job(uuid, text) IS
  'Completes only a currently live job lease owned by the supplied token.';--> statement-breakpoint
COMMENT ON FUNCTION hyrum_fail_job(uuid, text, text, text) IS
  'Fails or retries only a currently live job lease owned by the supplied token.';--> statement-breakpoint

REVOKE ALL ON FUNCTION hyrum_claim_jobs(text, integer, interval) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_renew_job_lease(uuid, text, interval) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_complete_job(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_fail_job(uuid, text, text, text) FROM PUBLIC;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS jobs_expired_running_idx
  ON public.jobs (lease_expires_at)
  WHERE status = 'running';
