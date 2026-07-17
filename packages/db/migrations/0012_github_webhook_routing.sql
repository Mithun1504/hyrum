-- GitHub webhooks are verified before their installation can be mapped to a
-- tenant. Expose only the minimum external-id routing result and delivery
-- finalization; tenant data remains protected by RLS.
CREATE OR REPLACE FUNCTION hyrum_resolve_github_installation(requested_installation_id bigint)
RETURNS TABLE (organization_id uuid, installation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT gi.organization_id, gi.id
  FROM public.github_installations gi
  WHERE gi.github_installation_id = requested_installation_id
    AND gi.deleted_at IS NULL
  LIMIT 1
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_finish_provider_webhook(
  requested_provider text,
  requested_delivery_id text,
  requested_organization_id uuid,
  requested_status text,
  requested_error_code text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.webhook_deliveries wd
  SET organization_id = COALESCE(wd.organization_id, requested_organization_id),
      processed_at = now(),
      status = requested_status,
      last_error_code = requested_error_code
  WHERE wd.provider = requested_provider
    AND wd.delivery_id = requested_delivery_id
    AND (wd.organization_id IS NULL OR wd.organization_id = requested_organization_id)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_resolve_github_installation(bigint) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_finish_provider_webhook(text, text, uuid, text, text) FROM PUBLIC;
