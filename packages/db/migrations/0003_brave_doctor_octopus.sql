CREATE TABLE "llm_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"response_id" text,
	"status" text NOT NULL,
	"input_digest" text NOT NULL,
	"result_digest" text NOT NULL,
	"token_usage" jsonb,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "behavior_observations_org_event_unique";--> statement-breakpoint
ALTER TABLE "llm_runs" ADD CONSTRAINT "llm_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_runs_org_task_created_idx" ON "llm_runs" USING btree ("organization_id","task","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_observations_org_event_behavior_unique" ON "behavior_observations" USING btree ("organization_id","event_id","behavior_id");