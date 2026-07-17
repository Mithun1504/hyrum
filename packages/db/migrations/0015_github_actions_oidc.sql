CREATE OR REPLACE FUNCTION hyrum_resolve_github_action_connection(
  requested_repository_id bigint,
  requested_service_slug text
)
RETURNS TABLE(organization_id uuid, api_service_id uuid, repository_connection_id uuid, repository_full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT c.organization_id, c.api_service_id, c.id, r.owner_login || '/' || r.name
  FROM service_repository_connections c
  JOIN github_repositories r
    ON r.organization_id = c.organization_id AND r.id = c.github_repository_id
  JOIN github_installations i
    ON i.organization_id = r.organization_id AND i.id = r.github_installation_id
  JOIN api_services s
    ON s.organization_id = c.organization_id AND s.id = c.api_service_id
  WHERE r.github_repository_id = requested_repository_id
    AND s.slug = requested_service_slug
    AND c.active AND c.deleted_at IS NULL
    AND r.active AND r.deleted_at IS NULL AND i.status = 'active' AND i.deleted_at IS NULL
  LIMIT 2
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION hyrum_resolve_github_action_connection(bigint, text) FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION hyrum_resolve_github_action_connection(bigint, text) TO %I',
    current_user
  );
END
$$;
