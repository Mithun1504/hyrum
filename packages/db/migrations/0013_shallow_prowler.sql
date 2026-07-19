ALTER TABLE "corpus_items" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD COLUMN "request_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD COLUMN "fixture_digest" text;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD COLUMN "fixture_object_key" text;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD COLUMN "stubs_object_key" text;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD COLUMN "curation_status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_priority_positive" CHECK ("corpus_items"."priority" > 0);