ALTER TABLE "replay_runs" ADD COLUMN "base_image_digest" text NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD COLUMN "candidate_image_digest" text NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_base_image_digest_format"
  CHECK ("base_image_digest" ~ '^sha256:[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_candidate_image_digest_format"
  CHECK ("candidate_image_digest" ~ '^sha256:[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_distinct_image_digests"
  CHECK ("base_image_digest" <> "candidate_image_digest");
