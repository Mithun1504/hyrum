-- List only the organizations to which an authenticated WorkOS subject has
-- an active product membership. This is intentionally usable before tenant
-- RLS context exists and returns no user profile or organization settings.
CREATE OR REPLACE FUNCTION hyrum_list_human_organizations(
  requested_workos_user_id text
)
RETURNS TABLE (
  organization_id uuid,
  workos_organization_id text,
  membership_id uuid,
  slug text,
  name text,
  status organization_status,
  role organization_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT o.id, o.workos_organization_id, m.id, o.slug, o.name, o.status, m.role
  FROM public.users u
  JOIN public.memberships m ON m.user_id = u.id
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE u.workos_user_id = requested_workos_user_id
    AND u.deleted_at IS NULL
    AND m.status = 'active'
    AND o.deleted_at IS NULL
    AND o.status IN ('provisioning', 'active')
  ORDER BY lower(o.name), o.id
$$;
--> statement-breakpoint
COMMENT ON FUNCTION hyrum_list_human_organizations(text) IS
  'RLS bootstrap: lists active Hyrum organization choices for one exact WorkOS subject.';
--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_list_human_organizations(text) FROM PUBLIC;
