-- Resolve an authenticated WorkOS identity before tenant RLS context exists.
-- The function returns only an active product membership and no profile data.
CREATE OR REPLACE FUNCTION hyrum_resolve_human_membership(
  requested_workos_user_id text,
  requested_workos_organization_id text
)
RETURNS TABLE (
  organization_id uuid,
  user_id uuid,
  membership_id uuid,
  role organization_role,
  last_authenticated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT o.id, u.id, m.id, m.role, u.last_authenticated_at
  FROM public.organizations o
  JOIN public.memberships m ON m.organization_id = o.id
  JOIN public.users u ON u.id = m.user_id
  WHERE o.workos_organization_id = requested_workos_organization_id
    AND u.workos_user_id = requested_workos_user_id
    AND o.deleted_at IS NULL
    AND o.status IN ('provisioning', 'active')
    AND u.deleted_at IS NULL
    AND m.status = 'active'
  LIMIT 1
$$;
--> statement-breakpoint
COMMENT ON FUNCTION hyrum_resolve_human_membership(text, text) IS
  'RLS bootstrap: resolves exact WorkOS subject and organization identifiers to one active Hyrum membership.';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hyrum_sync_workos_membership(
  requested_workos_organization_id text,
  requested_organization_name text,
  requested_organization_slug text,
  requested_workos_user_id text,
  requested_user_email text,
  requested_user_display_name text,
  requested_user_avatar_url text,
  requested_last_authenticated_at timestamptz,
  requested_workos_membership_id text,
  requested_role organization_role,
  requested_membership_status membership_status
)
RETURNS TABLE (
  organization_id uuid,
  user_id uuid,
  membership_id uuid,
  role organization_role,
  last_authenticated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  resolved_organization_id uuid;
  resolved_user_id uuid;
  resolved_membership_id uuid;
  effective_role organization_role;
BEGIN
  INSERT INTO public.organizations (
    workos_organization_id, slug, name, status
  ) VALUES (
    requested_workos_organization_id,
    requested_organization_slug,
    requested_organization_name,
    'provisioning'
  )
  ON CONFLICT (workos_organization_id) DO UPDATE
    SET name = EXCLUDED.name, updated_at = now()
  RETURNING id INTO resolved_organization_id;

  INSERT INTO public.organization_settings (organization_id)
  VALUES (resolved_organization_id)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.users (
    workos_user_id, primary_email, display_name, avatar_url, last_authenticated_at
  ) VALUES (
    requested_workos_user_id,
    requested_user_email,
    requested_user_display_name,
    requested_user_avatar_url,
    requested_last_authenticated_at
  )
  ON CONFLICT (workos_user_id) DO UPDATE SET
    primary_email = EXCLUDED.primary_email,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    last_authenticated_at = GREATEST(public.users.last_authenticated_at, EXCLUDED.last_authenticated_at),
    deleted_at = NULL,
    updated_at = now()
  RETURNING id INTO resolved_user_id;

  effective_role := requested_role;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships WHERE organization_id = resolved_organization_id
  ) THEN
    effective_role := 'owner';
  END IF;

  INSERT INTO public.memberships (
    organization_id, user_id, workos_membership_id, role, status, joined_at,
    suspended_at, revoked_at
  ) VALUES (
    resolved_organization_id,
    resolved_user_id,
    requested_workos_membership_id,
    effective_role,
    requested_membership_status,
    CASE WHEN requested_membership_status = 'active' THEN now() ELSE NULL END,
    CASE WHEN requested_membership_status = 'suspended' THEN now() ELSE NULL END,
    CASE WHEN requested_membership_status = 'revoked' THEN now() ELSE NULL END
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    workos_membership_id = EXCLUDED.workos_membership_id,
    role = CASE
      WHEN public.memberships.role = 'owner' THEN 'owner'::organization_role
      ELSE EXCLUDED.role
    END,
    status = EXCLUDED.status,
    joined_at = COALESCE(public.memberships.joined_at, EXCLUDED.joined_at),
    suspended_at = EXCLUDED.suspended_at,
    revoked_at = EXCLUDED.revoked_at,
    updated_at = now()
  RETURNING id, public.memberships.role INTO resolved_membership_id, effective_role;

  RETURN QUERY SELECT
    resolved_organization_id,
    resolved_user_id,
    resolved_membership_id,
    effective_role,
    requested_last_authenticated_at;
END
$$;
--> statement-breakpoint
COMMENT ON FUNCTION hyrum_sync_workos_membership(
  text, text, text, text, text, text, text, timestamptz, text,
  organization_role, membership_status
) IS 'Idempotently mirrors a verified WorkOS organization, user, and membership before tenant RLS context exists.';
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_resolve_human_membership(text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_sync_workos_membership(
  text, text, text, text, text, text, text, timestamptz, text,
  organization_role, membership_status
) FROM PUBLIC;
