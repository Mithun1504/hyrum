ALTER TABLE "outbox_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "outbox_events" SET "idempotency_key" = 'legacy:' || "id" WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_org_idempotency_unique" ON "outbox_events" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
INSERT INTO "jobs" ("organization_id", "type", "payload", "idempotency_key")
SELECT
  "organization_id",
  'outbox.publish',
  jsonb_build_object('outbox_event_id', "id"),
  'outbox:legacy:' || "id"
FROM "outbox_events"
WHERE "published_at" IS NULL
ON CONFLICT ("organization_id", "idempotency_key") DO NOTHING;--> statement-breakpoint
GRANT INSERT ON "jobs" TO hyrum_worker;--> statement-breakpoint
GRANT SELECT, DELETE ON "receipts" TO hyrum_worker;
