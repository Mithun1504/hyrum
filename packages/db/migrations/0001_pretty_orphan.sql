CREATE TYPE "public"."assertion_status" AS ENUM('active', 'expired', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."behavior_kind" AS ENUM('shape', 'ordering', 'error', 'status');--> statement-breakpoint
CREATE TYPE "public"."claim_state" AS ENUM('active', 'stale', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."evidence_tier" AS ENUM('T1', 'T2', 'T3');--> statement-breakpoint
CREATE TYPE "public"."replay_outcome" AS ENUM('pass', 'warn', 'block');--> statement-breakpoint
CREATE TABLE "api_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" text NOT NULL,
	"object_key" text NOT NULL,
	"digest" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assertions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"behavior_id" uuid NOT NULL,
	"claim_id" uuid,
	"owner_id" text NOT NULL,
	"reason" text NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "assertion_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fingerprint_digest" text NOT NULL,
	"kind" "behavior_kind" NOT NULL,
	"extractor_version" text NOT NULL,
	"fingerprint" jsonb NOT NULL,
	"declared" boolean DEFAULT false NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"behavior_id" uuid NOT NULL,
	"capture_session_id" uuid,
	"event_id" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"batch_id" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"session_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stable_id" text NOT NULL,
	"display_alias" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"corpus_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"operation_id" uuid,
	"consumer_id" uuid,
	"coverage_class" text NOT NULL,
	"object_key" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dependency_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"behavior_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"tier" "evidence_tier" NOT NULL,
	"state" "claim_state" DEFAULT 'active' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"receipt_id" uuid,
	"human_override_tier" "evidence_tier",
	"overridden_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"policy_id" uuid,
	"outcome" "replay_outcome" NOT NULL,
	"block_count" integer NOT NULL,
	"warn_count" integer NOT NULL,
	"note_count" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"block_tiers" text[] DEFAULT ARRAY['T1']::text[] NOT NULL,
	"warn_tiers" text[] DEFAULT ARRAY['T2']::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"behavior_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"operation_id" uuid,
	"tier" "evidence_tier" NOT NULL,
	"state" "claim_state" DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"freshness_until" timestamp with time zone NOT NULL,
	"receipt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_spec_id" uuid,
	"method" text NOT NULL,
	"path_template" text NOT NULL,
	"operation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "progress_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"resource_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"behavior_id" uuid,
	"consumer_id" uuid,
	"operation_id" uuid,
	"capture_session_id" uuid,
	"object_key" text,
	"digest" text NOT NULL,
	"redaction_version" text NOT NULL,
	"sequence_start" integer NOT NULL,
	"sequence_end" integer NOT NULL,
	"excerpt" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_corpora" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" text NOT NULL,
	"digest" text NOT NULL,
	"object_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_deltas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"kind" "behavior_kind" NOT NULL,
	"path" text NOT NULL,
	"digest" text NOT NULL,
	"stable" boolean NOT NULL,
	"quarantined" boolean NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"report_version" text NOT NULL,
	"base_url" text NOT NULL,
	"candidate_url" text NOT NULL,
	"extractor_version" text NOT NULL,
	"corpus_digest" text NOT NULL,
	"runs" integer NOT NULL,
	"outcome" "replay_outcome" NOT NULL,
	"report_digest" text NOT NULL,
	"signature_key_id" text NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "signing_public_key" text;--> statement-breakpoint
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_behavior_id_behavior_definitions_id_fk" FOREIGN KEY ("behavior_id") REFERENCES "public"."behavior_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_claim_id_dependency_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."dependency_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_definitions" ADD CONSTRAINT "behavior_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_behavior_id_behavior_definitions_id_fk" FOREIGN KEY ("behavior_id") REFERENCES "public"."behavior_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_capture_session_id_capture_sessions_id_fk" FOREIGN KEY ("capture_session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_batches" ADD CONSTRAINT "capture_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_batches" ADD CONSTRAINT "capture_batches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumers" ADD CONSTRAINT "consumers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_corpus_id_replay_corpora_id_fk" FOREIGN KEY ("corpus_id") REFERENCES "public"."replay_corpora"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_behavior_id_behavior_definitions_id_fk" FOREIGN KEY ("behavior_id") REFERENCES "public"."behavior_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD CONSTRAINT "gate_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD CONSTRAINT "gate_decisions_replay_run_id_replay_runs_id_fk" FOREIGN KEY ("replay_run_id") REFERENCES "public"."replay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD CONSTRAINT "gate_decisions_policy_id_gate_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."gate_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_policies" ADD CONSTRAINT "gate_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_claim_id_dependency_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."dependency_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_behavior_id_behavior_definitions_id_fk" FOREIGN KEY ("behavior_id") REFERENCES "public"."behavior_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_api_spec_id_api_specs_id_fk" FOREIGN KEY ("api_spec_id") REFERENCES "public"."api_specs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_behavior_id_behavior_definitions_id_fk" FOREIGN KEY ("behavior_id") REFERENCES "public"."behavior_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_capture_session_id_capture_sessions_id_fk" FOREIGN KEY ("capture_session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD CONSTRAINT "replay_corpora_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_replay_run_id_replay_runs_id_fk" FOREIGN KEY ("replay_run_id") REFERENCES "public"."replay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_specs_org_version_unique" ON "api_specs" USING btree ("organization_id","version");--> statement-breakpoint
CREATE INDEX "api_specs_org_active_idx" ON "api_specs" USING btree ("organization_id","active");--> statement-breakpoint
CREATE INDEX "assertions_org_expires_idx" ON "assertions" USING btree ("organization_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "assertions_org_behavior_idx" ON "assertions" USING btree ("organization_id","behavior_id");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_definitions_org_digest_unique" ON "behavior_definitions" USING btree ("organization_id","fingerprint_digest");--> statement-breakpoint
CREATE INDEX "behavior_definitions_org_kind_idx" ON "behavior_definitions" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_observations_org_event_unique" ON "behavior_observations" USING btree ("organization_id","event_id");--> statement-breakpoint
CREATE INDEX "behavior_observations_org_behavior_idx" ON "behavior_observations" USING btree ("organization_id","behavior_id");--> statement-breakpoint
CREATE INDEX "behavior_observations_org_consumer_idx" ON "behavior_observations" USING btree ("organization_id","consumer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_batches_org_agent_batch_unique" ON "capture_batches" USING btree ("organization_id","agent_id","batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_sessions_org_consumer_session_unique" ON "capture_sessions" USING btree ("organization_id","consumer_id","session_id");--> statement-breakpoint
CREATE INDEX "capture_sessions_org_started_idx" ON "capture_sessions" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consumers_org_stable_unique" ON "consumers" USING btree ("organization_id","stable_id");--> statement-breakpoint
CREATE INDEX "consumers_org_last_seen_idx" ON "consumers" USING btree ("organization_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "corpus_items_org_corpus_case_unique" ON "corpus_items" USING btree ("organization_id","corpus_id","case_id");--> statement-breakpoint
CREATE INDEX "corpus_items_org_coverage_idx" ON "corpus_items" USING btree ("organization_id","coverage_class");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_claims_org_behavior_consumer_unique" ON "dependency_claims" USING btree ("organization_id","behavior_id","consumer_id");--> statement-breakpoint
CREATE INDEX "dependency_claims_org_tier_idx" ON "dependency_claims" USING btree ("organization_id","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_decisions_org_run_unique" ON "gate_decisions" USING btree ("organization_id","replay_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_policies_org_version_unique" ON "gate_policies" USING btree ("organization_id","version");--> statement-breakpoint
CREATE INDEX "gate_policies_org_active_idx" ON "gate_policies" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_org_claim_unique" ON "ledger_entries" USING btree ("organization_id","claim_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_org_seen_idx" ON "ledger_entries" USING btree ("organization_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_org_tier_idx" ON "ledger_entries" USING btree ("organization_id","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_org_method_path_unique" ON "operations" USING btree ("organization_id","method","path_template");--> statement-breakpoint
CREATE INDEX "operations_org_idx" ON "operations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "progress_events_org_id_idx" ON "progress_events" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "receipts_org_behavior_idx" ON "receipts" USING btree ("organization_id","behavior_id");--> statement-breakpoint
CREATE INDEX "receipts_org_expires_idx" ON "receipts" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_corpora_org_digest_unique" ON "replay_corpora" USING btree ("organization_id","digest");--> statement-breakpoint
CREATE INDEX "replay_deltas_org_run_idx" ON "replay_deltas" USING btree ("organization_id","replay_run_id");--> statement-breakpoint
CREATE INDEX "replay_deltas_org_digest_idx" ON "replay_deltas" USING btree ("organization_id","digest");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_runs_org_report_digest_unique" ON "replay_runs" USING btree ("organization_id","report_digest");--> statement-breakpoint
CREATE INDEX "replay_runs_org_created_idx" ON "replay_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_token_prefix_unique" ON "agents" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "outbox_org_topic_idx" ON "outbox_events" USING btree ("organization_id","topic");