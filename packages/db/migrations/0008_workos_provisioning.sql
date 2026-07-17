DROP POLICY IF EXISTS "organizations_human_auth_provision_insert" ON "organizations";
--> statement-breakpoint
CREATE POLICY "organizations_human_auth_provision_insert" ON "organizations"
  FOR INSERT
  WITH CHECK (
    "workos_organization_id" = current_setting('app.workos_organization_id', true)
  );
--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_human_auth_provision_update" ON "organizations";
--> statement-breakpoint
CREATE POLICY "organizations_human_auth_provision_update" ON "organizations"
  FOR UPDATE
  USING (
    "workos_organization_id" = current_setting('app.workos_organization_id', true)
  )
  WITH CHECK (
    "workos_organization_id" = current_setting('app.workos_organization_id', true)
  );
--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_human_auth_provision_insert" ON "memberships";
--> statement-breakpoint
CREATE POLICY "memberships_human_auth_provision_insert" ON "memberships"
  FOR INSERT
  WITH CHECK (
    "organization_id" IN (
      SELECT "id" FROM "organizations"
      WHERE "workos_organization_id" = current_setting('app.workos_organization_id', true)
    )
    AND "user_id" IN (
      SELECT "id" FROM "users"
      WHERE "workos_user_id" = current_setting('app.workos_user_id', true)
    )
  );
