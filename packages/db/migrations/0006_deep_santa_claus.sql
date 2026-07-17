CREATE TYPE "public"."assertion_replay_outcome" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TABLE "replay_assertion_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"assertion_id" uuid NOT NULL,
	"behavior_id" uuid NOT NULL,
	"claim_id" uuid,
	"case_id" text NOT NULL,
	"outcome" "assertion_replay_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assertions" DROP CONSTRAINT "assertions_behavior_id_behavior_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "assertions" DROP CONSTRAINT "assertions_claim_id_dependency_claims_id_fk";
--> statement-breakpoint
ALTER TABLE "replay_assertion_results" ADD CONSTRAINT "replay_assertion_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_assertion_results" ADD CONSTRAINT "replay_assertion_results_replay_run_id_replay_runs_id_fk" FOREIGN KEY ("replay_run_id") REFERENCES "public"."replay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_assertion_results" ADD CONSTRAINT "replay_assertion_results_assertion_id_assertions_id_fk" FOREIGN KEY ("assertion_id") REFERENCES "public"."assertions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "replay_assertion_results_org_run_assertion_unique" ON "replay_assertion_results" USING btree ("organization_id","replay_run_id","assertion_id");--> statement-breakpoint
CREATE INDEX "replay_assertion_results_org_run_idx" ON "replay_assertion_results" USING btree ("organization_id","replay_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_definitions_org_id_unique" ON "behavior_definitions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_claims_org_id_behavior_unique" ON "dependency_claims" USING btree ("organization_id","id","behavior_id");--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_org_behavior_fk" FOREIGN KEY ("organization_id","behavior_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_org_claim_behavior_fk" FOREIGN KEY ("organization_id","claim_id","behavior_id") REFERENCES "public"."dependency_claims"("organization_id","id","behavior_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
UPDATE "gate_policies"
SET
  "warn_tiers" = ARRAY(
    SELECT DISTINCT tier
    FROM unnest("warn_tiers" || "block_tiers") AS tier
    WHERE tier IN ('T2', 'T3')
  ),
  "block_tiers" = CASE
    WHEN 'T1' = ANY("block_tiers") THEN ARRAY['T1']::text[]
    ELSE ARRAY[]::text[]
  END
WHERE NOT ("block_tiers" <@ ARRAY['T1']::text[] AND cardinality("block_tiers") <= 1);--> statement-breakpoint
ALTER TABLE "gate_policies" ADD CONSTRAINT "gate_policies_block_tiers_t1_only" CHECK ("gate_policies"."block_tiers" <@ ARRAY['T1']::text[] AND cardinality("gate_policies"."block_tiers") <= 1);--> statement-breakpoint
ALTER TABLE "replay_assertion_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "replay_assertion_results" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "replay_assertion_results_tenant_isolation" ON "replay_assertion_results"
  FOR ALL
  USING ("organization_id" = hyrum_app_organization_id())
  WITH CHECK ("organization_id" = hyrum_app_organization_id());
