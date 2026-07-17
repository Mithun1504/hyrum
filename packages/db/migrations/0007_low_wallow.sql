WITH ranked_replay_deltas AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id", "replay_run_id", "case_id", "kind", "path", "digest"
			ORDER BY "created_at", "id"
		) AS duplicate_rank
	FROM "replay_deltas"
)
DELETE FROM "replay_deltas"
USING ranked_replay_deltas
WHERE "replay_deltas"."id" = ranked_replay_deltas."id"
	AND ranked_replay_deltas.duplicate_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "replay_deltas_org_run_case_delta_unique" ON "replay_deltas" USING btree ("organization_id","replay_run_id","case_id","kind","path","digest");
