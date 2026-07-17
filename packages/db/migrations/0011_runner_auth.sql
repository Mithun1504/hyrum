-- Runner credentials are resolved before tenant context is known. Expose only
-- the exact active session's authentication and signature-verification fields.
CREATE OR REPLACE FUNCTION hyrum_resolve_runner_credential(requested_token_prefix text)
RETURNS TABLE (
  session_id uuid,
  organization_id uuid,
  replay_run_id uuid,
  token_hash text,
  scopes text[],
  nonce_digest text,
  report_signing_public_key text,
  signing_key_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.id, s.organization_id, s.replay_run_id, s.token_hash, s.scopes, s.nonce_digest,
         s.report_signing_public_key, s.signing_key_id
  FROM public.ci_runner_sessions s
  JOIN public.replay_runs r
    ON r.organization_id = s.organization_id AND r.id = s.replay_run_id
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.token_prefix = requested_token_prefix
    AND s.consumed_at IS NULL
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND r.status IN ('queued', 'running')
    AND o.status IN ('provisioning', 'active')
  LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_resolve_runner_credential(text) FROM PUBLIC;
