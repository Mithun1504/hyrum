-- Provider webhooks arrive before tenant context is known. These narrow
-- SECURITY DEFINER functions expose only idempotency and exact WorkOS-ID
-- reconciliation operations; callers cannot select tenant data through them.
CREATE OR REPLACE FUNCTION hyrum_claim_webhook_delivery(
  requested_provider text,
  requested_delivery_id text,
  requested_event_type text,
  requested_payload_digest text
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH inserted AS (
    INSERT INTO public.webhook_deliveries (
      provider, delivery_id, event_type, payload_digest,
      signature_verified, status, attempts
    ) VALUES (
      requested_provider, requested_delivery_id, requested_event_type,
      requested_payload_digest, true, 'processing', 1
    )
    ON CONFLICT (provider, delivery_id) DO UPDATE SET
      status = 'processing',
      attempts = public.webhook_deliveries.attempts + 1,
      processed_at = NULL,
      last_error_code = NULL
    WHERE public.webhook_deliveries.status = 'failed'
      AND public.webhook_deliveries.payload_digest = EXCLUDED.payload_digest
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM inserted)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_finish_webhook_delivery(
  requested_provider text,
  requested_delivery_id text,
  requested_workos_organization_id text,
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
  SET organization_id = COALESCE(
        wd.organization_id,
        (SELECT o.id FROM public.organizations o
         WHERE o.workos_organization_id = requested_workos_organization_id LIMIT 1)
      ),
      processed_at = now(),
      status = requested_status,
      last_error_code = requested_error_code
  WHERE wd.provider = requested_provider
    AND wd.delivery_id = requested_delivery_id
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_revoke_workos_membership(
  requested_workos_membership_id text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.memberships
  SET status = 'revoked', revoked_at = now(), suspended_at = NULL, updated_at = now()
  WHERE workos_membership_id = requested_workos_membership_id
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_sync_workos_invitation_state(
  requested_workos_invitation_id text,
  requested_status invitation_status,
  requested_expires_at timestamptz,
  requested_accepted_at timestamptz
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.invitations
  SET status = requested_status,
      expires_at = requested_expires_at,
      accepted_at = requested_accepted_at,
      updated_at = now()
  WHERE workos_invitation_id = requested_workos_invitation_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_claim_webhook_delivery(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_finish_webhook_delivery(text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_revoke_workos_membership(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_sync_workos_invitation_state(
  text, invitation_status, timestamptz, timestamptz
) FROM PUBLIC;
