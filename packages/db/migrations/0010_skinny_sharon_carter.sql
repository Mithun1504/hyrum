CREATE TABLE "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channels" ADD CONSTRAINT "slack_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_repositories_org_installation_repo_unique" ON "github_repositories" USING btree ("organization_id","installation_id","owner","name");--> statement-breakpoint
CREATE INDEX "github_repositories_org_active_idx" ON "github_repositories" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_channels_org_channel_unique" ON "slack_channels" USING btree ("organization_id","channel_id");--> statement-breakpoint
CREATE INDEX "slack_channels_org_active_idx" ON "slack_channels" USING btree ("organization_id","active");--> statement-breakpoint
ALTER TABLE "github_repositories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_repositories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "github_repositories_tenant_isolation" ON "github_repositories"
  FOR ALL
  USING ("organization_id" = hyrum_app_organization_id())
  WITH CHECK ("organization_id" = hyrum_app_organization_id());--> statement-breakpoint
ALTER TABLE "slack_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "slack_channels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "slack_channels_tenant_isolation" ON "slack_channels"
  FOR ALL
  USING ("organization_id" = hyrum_app_organization_id())
  WITH CHECK ("organization_id" = hyrum_app_organization_id());--> statement-breakpoint
GRANT SELECT ON "github_repositories", "slack_channels" TO hyrum_worker;
