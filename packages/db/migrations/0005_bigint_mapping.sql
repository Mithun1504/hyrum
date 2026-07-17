-- Preserve existing PostgreSQL defaults while recording lossless bigint mappings
-- in the Drizzle snapshot used by subsequent schema generation.
ALTER TABLE "consumers" ALTER COLUMN "request_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "usage_rollups" ALTER COLUMN "ingested_sessions" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "usage_rollups" ALTER COLUMN "observed_requests_estimate" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "usage_rollups" ALTER COLUMN "stored_bytes" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "usage_rollups" ALTER COLUMN "replay_requests" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "usage_rollups" ALTER COLUMN "llm_input_tokens" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "usage_rollups" ALTER COLUMN "llm_output_tokens" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "usage_rollups" ALTER COLUMN "llm_cost_microunits" SET DEFAULT 0;
