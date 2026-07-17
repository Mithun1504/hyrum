-- Machine credentials must be resolved before tenant context is known. These
-- functions reveal only the minimum authentication material for one exact,
-- active token prefix and provide a narrow last-used update.
CREATE OR REPLACE FUNCTION hyrum_resolve_machine_credential(requested_token_prefix text)
RETURNS TABLE (
  credential_id uuid,
  organization_id uuid,
  agent_id uuid,
  api_service_id uuid,
  environment_id uuid,
  token_hash text,
  scopes text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT mc.id, mc.organization_id, mc.agent_id, a.api_service_id,
         a.environment_id, mc.token_hash, mc.scopes
  FROM public.machine_credentials mc
  JOIN public.agents a
    ON a.organization_id = mc.organization_id AND a.id = mc.agent_id
  JOIN public.organizations o ON o.id = mc.organization_id
  WHERE mc.token_prefix = requested_token_prefix
    AND mc.revoked_at IS NULL
    AND mc.expires_at > now()
    AND a.revoked_at IS NULL
    AND a.status <> 'revoked'
    AND o.status IN ('provisioning', 'active')
  LIMIT 1
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_touch_machine_credential(requested_credential_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.machine_credentials
  SET last_used_at = now(), updated_at = now()
  WHERE id = requested_credential_id
    AND revoked_at IS NULL
    AND expires_at > now()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_resolve_machine_credential(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_touch_machine_credential(uuid) FROM PUBLIC;
