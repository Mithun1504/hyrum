ALTER TABLE "replay_runs" ADD COLUMN "fixture_digest" text NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD COLUMN "mask_digest" text NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD COLUMN "runner_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD COLUMN "policy_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD COLUMN "policy_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_policy_id_gate_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."gate_policies"("id") ON DELETE restrict ON UPDATE no action;