ALTER TABLE "assertions" ADD COLUMN "resolution_type" text;--> statement-breakpoint
ALTER TABLE "assertions" ADD COLUMN "resolution_reason" text;--> statement-breakpoint
ALTER TABLE "assertions" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "assertions" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assertions" ADD COLUMN "customer_notice" jsonb;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD COLUMN "overridden_at" timestamp with time zone;