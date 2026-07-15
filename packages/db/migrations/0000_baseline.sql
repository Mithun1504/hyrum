CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'ci_runner', 'platform_operator', 'system');--> statement-breakpoint
CREATE TYPE "public"."adapter_type" AS ENUM('ndjson', 'http_proxy', 'kong', 'envoy_als', 'log_tap');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('pending', 'online', 'degraded', 'offline', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."allowed_operation_mode" AS ENUM('read_only', 'explicit_writes');--> statement-breakpoint
CREATE TYPE "public"."api_spec_source" AS ENUM('upload', 'github', 'generated_draft');--> statement-breakpoint
CREATE TYPE "public"."assertion_event_type" AS ENUM('pinned', 'extended', 'documented', 'break_scheduled', 'reassigned', 'expired', 'cancelled', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."assertion_resolution" AS ENUM('documented', 'extended', 'deliberately_broken', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."assertion_scope" AS ENUM('all_consumers', 'selected_consumers');--> statement-breakpoint
CREATE TYPE "public"."assertion_status" AS ENUM('active', 'expiring', 'expired', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('succeeded', 'denied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."behavior_cluster_source" AS ENUM('model', 'human');--> statement-breakpoint
CREATE TYPE "public"."behavior_kind" AS ENUM('shape', 'ordering', 'error_template');--> statement-breakpoint
CREATE TYPE "public"."behavior_label_source" AS ENUM('deterministic', 'model', 'human');--> statement-breakpoint
CREATE TYPE "public"."breaking_change_plan_status" AS ENUM('draft', 'scheduled', 'communication_ready', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."claim_proposer" AS ENUM('rules', 'model', 'human');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('proposed', 'active', 'disputed', 'dismissed', 'stale', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."cluster_membership_source" AS ENUM('model', 'human');--> statement-breakpoint
CREATE TYPE "public"."communication_status" AS ENUM('pending', 'drafted', 'reviewed', 'exported', 'acknowledged', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."configuration_status" AS ENUM('draft', 'active', 'superseded', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."consumer_alias_source" AS ENUM('generated', 'customer', 'integration');--> statement-breakpoint
CREATE TYPE "public"."consumer_identity_source" AS ENUM('api_key', 'client_id', 'configured_header');--> statement-breakpoint
CREATE TYPE "public"."corpus_status" AS ENUM('building', 'ready', 'superseded', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."coverage_class" AS ENUM('shape', 'ordering', 'error_template', 'assertion', 'negative_control');--> statement-breakpoint
CREATE TYPE "public"."data_subject_request_type" AS ENUM('export', 'delete_organization', 'delete_user');--> statement-breakpoint
CREATE TYPE "public"."declaration_status" AS ENUM('undeclared', 'declared', 'partially_declared', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."delta_stability" AS ENUM('pending', 'stable', 'flaky', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('draft', 'accepted', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."draft_type" AS ENUM('impact_explanation', 'spec_patch', 'customer_notice');--> statement-breakpoint
CREATE TYPE "public"."environment_kind" AS ENUM('production', 'staging', 'development', 'demo');--> statement-breakpoint
CREATE TYPE "public"."evaluation_metric_name" AS ENUM('precision', 'recall', 'f1', 'true_positive', 'false_positive', 'false_negative', 'replay_stability', 'break_detection_rate', 'assertion_resolution_rate', 'assertion_auto_extension_rate', 'time_to_ledger_seconds', 'citation_validity', 'abstention_rate');--> statement-breakpoint
CREATE TYPE "public"."evaluation_scope" AS ENUM('global', 'organization');--> statement-breakpoint
CREATE TYPE "public"."evaluation_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."evidence_role" AS ENUM('primary', 'supporting', 'counterexample');--> statement-breakpoint
CREATE TYPE "public"."evidence_tier" AS ENUM('t1', 't2', 't3');--> statement-breakpoint
CREATE TYPE "public"."freshness_status" AS ENUM('fresh', 'aging', 'stale');--> statement-breakpoint
CREATE TYPE "public"."gate_exception_status" AS ENUM('pending', 'approved', 'used', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."gate_outcome" AS ENUM('pass', 'note', 'warn', 'block', 'error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gate_policy_version_status" AS ENUM('draft', 'active', 'superseded', 'retired');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('received', 'validated', 'processing', 'processed', 'partially_rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('pending', 'active', 'degraded', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'dead', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."key_purpose" AS ENUM('consumer_identity_hmac', 'structural_hmac', 'integration_encryption', 'object_encryption');--> statement-breakpoint
CREATE TYPE "public"."key_version_status" AS ENUM('pending', 'active', 'retiring', 'retired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."llm_run_status" AS ENUM('queued', 'running', 'succeeded', 'rejected', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'slack');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'suppressed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."object_availability" AS ENUM('pending', 'available', 'expired', 'quarantined', 'deleted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."object_kind" AS ENUM('api_spec', 'capture_batch', 'receipt_bundle', 'replay_corpus', 'replay_report', 'fixture_bundle', 'generated_artifact', 'evaluation_dataset', 'deletion_manifest');--> statement-breakpoint
CREATE TYPE "public"."object_scan_status" AS ENUM('not_required', 'pending', 'clean', 'infected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('owner', 'admin', 'engineer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('provisioning', 'active', 'suspended', 'deleting', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."platform_operator_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."prompt_status" AS ENUM('draft', 'evaluated', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."receipt_type" AS ENUM('t1_echo', 't2_pattern', 'exposure', 'replay_delta', 'assertion');--> statement-breakpoint
CREATE TYPE "public"."replay_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."replay_trigger_type" AS ENUM('manual', 'pull_request', 'assertion', 'evaluation', 'demo');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'verified', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('unreviewed', 'confirmed', 'demoted', 'promoted', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."reviewable_status" AS ENUM('proposed', 'active', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('onboarding', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."session_completeness" AS ENUM('complete', 'partial_start', 'partial_end', 'gapped');--> statement-breakpoint
CREATE TYPE "public"."validation_result" AS ENUM('pending', 'passed', 'failed', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('pending', 'valid', 'invalid', 'failed');--> statement-breakpoint
CREATE TABLE "generated_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"draft_type" "draft_type" NOT NULL,
	"behavior_definition_id" uuid,
	"behavior_cluster_id" uuid,
	"assertion_id" uuid,
	"breaking_change_plan_id" uuid,
	"replay_run_id" uuid,
	"gate_decision_id" uuid,
	"llm_run_id" uuid NOT NULL,
	"content_object_id" uuid,
	"content_excerpt" text NOT NULL,
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"reviewed_by_membership_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_drafts_excerpt_ck" CHECK (length("generated_drafts"."content_excerpt") <= 8000)
);
--> statement-breakpoint
CREATE TABLE "llm_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"llm_run_id" uuid NOT NULL,
	"receipt_id" uuid,
	"dependency_claim_id" uuid,
	"replay_delta_id" uuid,
	"behavior_definition_id" uuid,
	"response_sequence_no" bigint,
	"request_sequence_no" bigint,
	"response_json_path" text,
	"request_json_path" text,
	"citation_role" text NOT NULL,
	"validated" boolean DEFAULT false NOT NULL,
	"validation_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_citations_exactly_one_resource_ck" CHECK (num_nonnulls("llm_citations"."receipt_id", "llm_citations"."dependency_claim_id", "llm_citations"."replay_delta_id", "llm_citations"."behavior_definition_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "llm_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid,
	"task_type" text NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"model" text NOT NULL,
	"model_snapshot" text NOT NULL,
	"reasoning_effort" text,
	"input_digest" text NOT NULL,
	"cache_key" text NOT NULL,
	"openai_response_id" text,
	"status" "llm_run_status" DEFAULT 'queued' NOT NULL,
	"schema_valid" boolean,
	"deterministic_validation_status" "validation_result" DEFAULT 'pending' NOT NULL,
	"output_digest" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_microunits" bigint,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"abstention_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" text NOT NULL,
	"version" integer NOT NULL,
	"model_family" text NOT NULL,
	"prompt_digest" text NOT NULL,
	"schema_digest" text NOT NULL,
	"source_revision" text NOT NULL,
	"status" "prompt_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assertion_consumers" (
	"organization_id" uuid NOT NULL,
	"assertion_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assertion_consumers_assertion_id_consumer_id_pk" PRIMARY KEY("assertion_id","consumer_id")
);
--> statement-breakpoint
CREATE TABLE "assertion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assertion_id" uuid NOT NULL,
	"event_type" "assertion_event_type" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"reason" text,
	"previous_expiry" timestamp with time zone,
	"new_expiry" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assertions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"source_claim_id" uuid,
	"owner_membership_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "assertion_status" DEFAULT 'active' NOT NULL,
	"scope" "assertion_scope" DEFAULT 'all_consumers' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '90 days' NOT NULL,
	"remind_at" timestamp with time zone,
	"resolution" "assertion_resolution",
	"resolved_at" timestamp with time zone,
	"resolved_by_membership_id" uuid,
	"supersedes_assertion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assertions_reason_ck" CHECK (length(trim("assertions"."reason")) > 0),
	CONSTRAINT "assertions_window_ck" CHECK ("assertions"."expires_at" > "assertions"."starts_at"),
	CONSTRAINT "assertions_reminder_ck" CHECK ("assertions"."remind_at" is null or ("assertions"."remind_at" >= "assertions"."starts_at" and "assertions"."remind_at" <= "assertions"."expires_at"))
);
--> statement-breakpoint
CREATE TABLE "breaking_change_impacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"breaking_change_plan_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"dependency_claim_id" uuid,
	"evidence_tier" "evidence_tier" NOT NULL,
	"impact_digest" text NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"receipt_id" uuid,
	"communication_status" "communication_status" DEFAULT 'pending' NOT NULL,
	"exclusion_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breaking_change_impacts_exclusion_ck" CHECK ("breaking_change_impacts"."communication_status" <> 'excluded' or length(trim("breaking_change_impacts"."exclusion_reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "breaking_change_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"assertion_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"owner_membership_id" uuid NOT NULL,
	"planned_for" timestamp with time zone NOT NULL,
	"status" "breaking_change_plan_status" DEFAULT 'draft' NOT NULL,
	"reason" text NOT NULL,
	"communication_due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breaking_change_plans_reason_ck" CHECK (length(trim("breaking_change_plans"."reason")) > 0),
	CONSTRAINT "breaking_change_plans_planned_ck" CHECK ("breaking_change_plans"."planned_for" > "breaking_change_plans"."created_at")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"organization_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"support_access_grant_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text NOT NULL,
	"source_ip_hash" text,
	"user_agent_family" text,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_occurred_at_id_pk" PRIMARY KEY("occurred_at","id")
) PARTITION BY RANGE ("occurred_at");
--> statement-breakpoint
CREATE TABLE "audit_events_2026_07" PARTITION OF "audit_events" FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');--> statement-breakpoint
CREATE TABLE "audit_events_2026_08" PARTITION OF "audit_events" FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');--> statement-breakpoint
CREATE TABLE "audit_events_2026_09" PARTITION OF "audit_events" FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');--> statement-breakpoint
CREATE TABLE "audit_events_default" PARTITION OF "audit_events" DEFAULT;--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_type" "data_subject_request_type" NOT NULL,
	"subject_user_id" uuid,
	"requested_by_membership_id" uuid NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"verification_completed_at" timestamp with time zone,
	"export_object_id" uuid,
	"deletion_manifest_object_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	CONSTRAINT "data_subject_requests_subject_ck" CHECK ("data_subject_requests"."request_type" <> 'delete_user' or "data_subject_requests"."subject_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "platform_audit_events" (
	"occurred_at" timestamp with time zone NOT NULL,
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "platform_audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text NOT NULL,
	"change_digest" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_audit_events_occurred_at_id_pk" PRIMARY KEY("occurred_at","id"),
	CONSTRAINT "platform_audit_events_actor_type_ck" CHECK ("platform_audit_events"."actor_type" in ('platform_operator', 'system'))
) PARTITION BY RANGE ("occurred_at");
--> statement-breakpoint
CREATE TABLE "platform_audit_events_2026_07" PARTITION OF "platform_audit_events" FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');--> statement-breakpoint
CREATE TABLE "platform_audit_events_2026_08" PARTITION OF "platform_audit_events" FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');--> statement-breakpoint
CREATE TABLE "platform_audit_events_2026_09" PARTITION OF "platform_audit_events" FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');--> statement-breakpoint
CREATE TABLE "platform_audit_events_default" PARTITION OF "platform_audit_events" DEFAULT;--> statement-breakpoint
CREATE TABLE "behavior_cluster_members" (
	"organization_id" uuid NOT NULL,
	"behavior_cluster_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"membership_source" "cluster_membership_source" NOT NULL,
	"score" numeric(5, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "behavior_cluster_members_behavior_cluster_id_behavior_definition_id_pk" PRIMARY KEY("behavior_cluster_id","behavior_definition_id"),
	CONSTRAINT "behavior_cluster_members_score_ck" CHECK ("behavior_cluster_members"."score" is null or ("behavior_cluster_members"."score" >= 0 and "behavior_cluster_members"."score" <= 1))
);
--> statement-breakpoint
CREATE TABLE "behavior_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"source" "behavior_cluster_source" NOT NULL,
	"llm_run_id" uuid,
	"input_digest" text NOT NULL,
	"status" "reviewable_status" DEFAULT 'proposed' NOT NULL,
	"supersedes_cluster_id" uuid,
	"reviewed_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"api_operation_id" uuid NOT NULL,
	"kind" "behavior_kind" NOT NULL,
	"fingerprint_schema_version" integer NOT NULL,
	"extractor_release_id" uuid NOT NULL,
	"canonical_fingerprint" jsonb NOT NULL,
	"fingerprint_digest" text NOT NULL,
	"default_label" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"source" "behavior_label_source" NOT NULL,
	"llm_run_id" uuid,
	"status" "reviewable_status" DEFAULT 'proposed' NOT NULL,
	"reviewed_by_membership_id" uuid,
	"supersedes_label_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_observations" (
	"organization_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "behavior_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"environment_id" uuid NOT NULL,
	"api_operation_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"observation_count" bigint NOT NULL,
	"session_count" bigint NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"sample_weight" numeric NOT NULL,
	"support_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "behavior_observations_bucket_start_id_pk" PRIMARY KEY("bucket_start","id"),
	CONSTRAINT "behavior_observations_counts_ck" CHECK ("behavior_observations"."observation_count" > 0 and "behavior_observations"."session_count" > 0)
) PARTITION BY RANGE ("bucket_start");
--> statement-breakpoint
CREATE TABLE "behavior_observations_2026_07" PARTITION OF "behavior_observations" FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');--> statement-breakpoint
CREATE TABLE "behavior_observations_2026_08" PARTITION OF "behavior_observations" FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');--> statement-breakpoint
CREATE TABLE "behavior_observations_2026_09" PARTITION OF "behavior_observations" FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');--> statement-breakpoint
CREATE TABLE "behavior_observations_default" PARTITION OF "behavior_observations" DEFAULT;--> statement-breakpoint
CREATE TABLE "behavior_spec_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"api_spec_id" uuid NOT NULL,
	"status" "declaration_status" NOT NULL,
	"reason_code" text NOT NULL,
	"comparison_details" jsonb NOT NULL,
	"comparator_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"external_instance_key" text NOT NULL,
	"status" "agent_status" DEFAULT 'pending' NOT NULL,
	"adapter_type" "adapter_type" NOT NULL,
	"agent_version" text NOT NULL,
	"extractor_release_id" uuid NOT NULL,
	"redaction_policy_version_id" uuid NOT NULL,
	"sampling_policy_version_id" uuid NOT NULL,
	"config_revision" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_error_code" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_config_revision_ck" CHECK ("agents"."config_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "capture_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"ingestion_batch_id" uuid NOT NULL,
	"session_hmac" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"first_sequence_no" bigint NOT NULL,
	"last_sequence_no" bigint NOT NULL,
	"event_count" integer NOT NULL,
	"completeness" "session_completeness" NOT NULL,
	"correlation_source" text NOT NULL,
	"sampling_probability" numeric(6, 5) NOT NULL,
	"low_volume_boost_applied" boolean DEFAULT false NOT NULL,
	"structural_hmac_key_version_id" uuid NOT NULL,
	"receipt_bundle_object_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_sessions_sequence_ck" CHECK ("capture_sessions"."last_sequence_no" >= "capture_sessions"."first_sequence_no"),
	CONSTRAINT "capture_sessions_time_ck" CHECK ("capture_sessions"."ended_at" >= "capture_sessions"."started_at"),
	CONSTRAINT "capture_sessions_event_count_ck" CHECK ("capture_sessions"."event_count" > 0),
	CONSTRAINT "capture_sessions_sampling_ck" CHECK ("capture_sessions"."sampling_probability" > 0 and "capture_sessions"."sampling_probability" <= 1)
);
--> statement-breakpoint
CREATE TABLE "consumer_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"identity_source" "consumer_identity_source" NOT NULL,
	"identifier_hmac" text NOT NULL,
	"consumer_hmac_key_version_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"display_alias" text NOT NULL,
	"alias_source" "consumer_alias_source" DEFAULT 'generated' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"request_count" bigint DEFAULT 0 NOT NULL,
	"low_volume" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "consumers_request_count_ck" CHECK ("consumers"."request_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_batch_id" text NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"payload_digest" text NOT NULL,
	"schema_version" integer NOT NULL,
	"extractor_release_id" uuid NOT NULL,
	"redaction_policy_version_id" uuid NOT NULL,
	"sampling_policy_version_id" uuid NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"accepted_item_count" integer DEFAULT 0 NOT NULL,
	"rejected_item_count" integer DEFAULT 0 NOT NULL,
	"status" "ingestion_status" DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_code" text,
	"rejection_manifest_object_id" uuid,
	"rejection_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_batches_counts_ck" CHECK ("ingestion_batches"."session_count" >= 0 and "ingestion_batches"."accepted_item_count" >= 0 and "ingestion_batches"."rejected_item_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "machine_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"rotated_from_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mask_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"rules_digest" text NOT NULL,
	"status" "configuration_status" DEFAULT 'draft' NOT NULL,
	"created_by_membership_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mask_profile_versions_version_ck" CHECK ("mask_profile_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "redaction_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "configuration_status" DEFAULT 'draft' NOT NULL,
	"cel_source" text NOT NULL,
	"compiled_digest" text NOT NULL,
	"structural_hmac_key_version_id" uuid NOT NULL,
	"consumer_hmac_key_version_id" uuid NOT NULL,
	"created_by_membership_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redaction_policy_versions_version_ck" CHECK ("redaction_policy_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "replay_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"mask_profile_version_id" uuid NOT NULL,
	"fixture_object_id" uuid,
	"stub_object_id" uuid,
	"allowed_operation_mode" "allowed_operation_mode" DEFAULT 'read_only' NOT NULL,
	"network_egress_enabled" boolean DEFAULT false NOT NULL,
	"request_timeout_ms" integer NOT NULL,
	"resource_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_digest" text NOT NULL,
	"status" "configuration_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_profiles_version_ck" CHECK ("replay_profiles"."version" > 0),
	CONSTRAINT "replay_profiles_timeout_ck" CHECK ("replay_profiles"."request_timeout_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "sampling_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"session_window_seconds" integer NOT NULL,
	"base_sample_rate" numeric(6, 5) NOT NULL,
	"low_volume_threshold" integer NOT NULL,
	"low_volume_boost" numeric(6, 2) NOT NULL,
	"correlation_header_names" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"compiled_digest" text NOT NULL,
	"status" "configuration_status" DEFAULT 'draft' NOT NULL,
	"created_by_membership_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sampling_policy_versions_version_ck" CHECK ("sampling_policy_versions"."version" > 0),
	CONSTRAINT "sampling_policy_versions_window_ck" CHECK ("sampling_policy_versions"."session_window_seconds" > 0),
	CONSTRAINT "sampling_policy_versions_rate_ck" CHECK ("sampling_policy_versions"."base_sample_rate" >= 0 and "sampling_policy_versions"."base_sample_rate" <= 1),
	CONSTRAINT "sampling_policy_versions_threshold_ck" CHECK ("sampling_policy_versions"."low_volume_threshold" >= 0),
	CONSTRAINT "sampling_policy_versions_boost_ck" CHECK ("sampling_policy_versions"."low_volume_boost" >= 1)
);
--> statement-breakpoint
CREATE TABLE "evaluation_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "evaluation_scope" NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"stored_object_id" uuid,
	"repository_path" text,
	"dataset_digest" text NOT NULL,
	"label_schema_version" integer NOT NULL,
	"example_count" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_datasets_scope_ck" CHECK (("evaluation_datasets"."scope" = 'global' and "evaluation_datasets"."organization_id" is null and "evaluation_datasets"."repository_path" is not null and "evaluation_datasets"."stored_object_id" is null) or ("evaluation_datasets"."scope" = 'organization' and "evaluation_datasets"."organization_id" is not null and "evaluation_datasets"."repository_path" is null and "evaluation_datasets"."stored_object_id" is not null)),
	CONSTRAINT "evaluation_datasets_storage_ck" CHECK (num_nonnulls("evaluation_datasets"."stored_object_id", "evaluation_datasets"."repository_path") = 1),
	CONSTRAINT "evaluation_datasets_counts_ck" CHECK ("evaluation_datasets"."version" > 0 and "evaluation_datasets"."example_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "evaluation_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "evaluation_scope" NOT NULL,
	"organization_id" uuid,
	"evaluation_run_id" uuid NOT NULL,
	"metric_name" "evaluation_metric_name" NOT NULL,
	"behavior_kind" "behavior_kind",
	"evidence_tier" "evidence_tier",
	"value" numeric NOT NULL,
	"sample_count" integer NOT NULL,
	"threshold" numeric,
	"passed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_metrics_sample_count_ck" CHECK ("evaluation_metrics"."sample_count" >= 0),
	CONSTRAINT "evaluation_metrics_scope_ck" CHECK (("evaluation_metrics"."scope" = 'global' and "evaluation_metrics"."organization_id" is null) or ("evaluation_metrics"."scope" = 'organization' and "evaluation_metrics"."organization_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "evaluation_scope" NOT NULL,
	"organization_id" uuid,
	"api_service_id" uuid,
	"evaluation_dataset_id" uuid NOT NULL,
	"evaluation_type" text NOT NULL,
	"extractor_release_id" uuid NOT NULL,
	"prompt_version_id" uuid,
	"rule_version" text NOT NULL,
	"config_digest" text NOT NULL,
	"status" "evaluation_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"result_object_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_runs_scope_ck" CHECK (("evaluation_runs"."scope" = 'global' and "evaluation_runs"."organization_id" is null and "evaluation_runs"."api_service_id" is null) or ("evaluation_runs"."scope" = 'organization' and "evaluation_runs"."organization_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "usage_rollups" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"api_service_id" uuid,
	"service_scope_key" uuid GENERATED ALWAYS AS (coalesce(api_service_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED NOT NULL,
	"ingested_sessions" bigint DEFAULT 0 NOT NULL,
	"observed_requests_estimate" bigint DEFAULT 0 NOT NULL,
	"stored_bytes" bigint DEFAULT 0 NOT NULL,
	"replay_requests" bigint DEFAULT 0 NOT NULL,
	"llm_input_tokens" bigint DEFAULT 0 NOT NULL,
	"llm_output_tokens" bigint DEFAULT 0 NOT NULL,
	"llm_cost_microunits" bigint DEFAULT 0 NOT NULL,
	"job_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_rollups_organization_id_day_service_scope_key_pk" PRIMARY KEY("organization_id","day","service_scope_key"),
	CONSTRAINT "usage_rollups_nonnegative_ck" CHECK ("usage_rollups"."ingested_sessions" >= 0 and "usage_rollups"."observed_requests_estimate" >= 0 and "usage_rollups"."stored_bytes" >= 0 and "usage_rollups"."replay_requests" >= 0 and "usage_rollups"."llm_input_tokens" >= 0 and "usage_rollups"."llm_output_tokens" >= 0 and "usage_rollups"."llm_cost_microunits" >= 0 and "usage_rollups"."job_failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "claim_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dependency_claim_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"evidence_role" "evidence_role" NOT NULL,
	"response_sequence_no" bigint,
	"request_sequence_no" bigint,
	"response_json_path" text,
	"request_json_path" text,
	"value_hmac" text,
	"structural_hmac_key_version_id" uuid,
	"pattern_metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_evidence_location_uq" UNIQUE NULLS NOT DISTINCT("dependency_claim_id","receipt_id","evidence_role","response_sequence_no","request_sequence_no","response_json_path","request_json_path"),
	CONSTRAINT "claim_evidence_sequence_ck" CHECK ("claim_evidence"."request_sequence_no" is null or "claim_evidence"."response_sequence_no" is null or "claim_evidence"."request_sequence_no" > "claim_evidence"."response_sequence_no")
);
--> statement-breakpoint
CREATE TABLE "claim_review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dependency_claim_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"decision" "review_state" NOT NULL,
	"from_tier" "evidence_tier",
	"to_tier" "evidence_tier",
	"reason" text NOT NULL,
	"recent_auth_at" timestamp with time zone NOT NULL,
	"supersedes_decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dependency_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"tier" "evidence_tier" NOT NULL,
	"status" "claim_status" DEFAULT 'proposed' NOT NULL,
	"rule_version" text NOT NULL,
	"deterministic_eligible" boolean DEFAULT false NOT NULL,
	"support_count" bigint NOT NULL,
	"confidence" numeric(5, 4),
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"supersedes_claim_id" uuid,
	"proposed_by" "claim_proposer" NOT NULL,
	"llm_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dependency_claims_support_ck" CHECK ("dependency_claims"."support_count" >= 0),
	CONSTRAINT "dependency_claims_t1_eligibility_ck" CHECK ("dependency_claims"."tier" <> 't1' or "dependency_claims"."deterministic_eligible"),
	CONSTRAINT "dependency_claims_t3_confidence_ck" CHECK ("dependency_claims"."tier" <> 't3' or "dependency_claims"."confidence" is null),
	CONSTRAINT "dependency_claims_confidence_ck" CHECK ("dependency_claims"."confidence" is null or ("dependency_claims"."confidence" >= 0 and "dependency_claims"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dependency_claim_id" uuid NOT NULL,
	"owner_membership_id" uuid,
	"review_state" "review_state" DEFAULT 'unreviewed' NOT NULL,
	"freshness_status" "freshness_status" DEFAULT 'fresh' NOT NULL,
	"first_detected_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"stale_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"search_document" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"capture_session_id" uuid NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"receipt_type" "receipt_type" NOT NULL,
	"bundle_digest" text NOT NULL,
	"redaction_policy_version_id" uuid NOT NULL,
	"extractor_release_id" uuid NOT NULL,
	"sequence_start" bigint NOT NULL,
	"sequence_end" bigint NOT NULL,
	"completeness" text NOT NULL,
	"approved_excerpt" text,
	"availability_status" "object_availability" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_sequence_ck" CHECK ("receipts"."sequence_end" >= "receipts"."sequence_start"),
	CONSTRAINT "receipts_excerpt_length_ck" CHECK ("receipts"."approved_excerpt" is null or length("receipts"."approved_excerpt") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "gate_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gate_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"gate_policy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"config_digest" text NOT NULL,
	"t1_action" "gate_outcome" DEFAULT 'block' NOT NULL,
	"t2_action" "gate_outcome" DEFAULT 'warn' NOT NULL,
	"t3_action" "gate_outcome" DEFAULT 'pass' NOT NULL,
	"assertion_action" "gate_outcome" DEFAULT 'block' NOT NULL,
	"flaky_action" "gate_outcome" DEFAULT 'warn' NOT NULL,
	"minimum_stable_attempts" integer DEFAULT 2 NOT NULL,
	"status" "gate_policy_version_status" DEFAULT 'draft' NOT NULL,
	"created_by_membership_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_policy_versions_version_ck" CHECK ("gate_policy_versions"."version" > 0),
	CONSTRAINT "gate_policy_versions_attempts_ck" CHECK ("gate_policy_versions"."minimum_stable_attempts" >= 2),
	CONSTRAINT "gate_policy_versions_t1_action_ck" CHECK ("gate_policy_versions"."t1_action" in ('block', 'warn', 'note')),
	CONSTRAINT "gate_policy_versions_t2_action_ck" CHECK ("gate_policy_versions"."t2_action" in ('warn', 'note', 'pass')),
	CONSTRAINT "gate_policy_versions_t3_action_ck" CHECK ("gate_policy_versions"."t3_action" in ('note', 'pass')),
	CONSTRAINT "gate_policy_versions_assertion_action_ck" CHECK ("gate_policy_versions"."assertion_action" in ('block', 'warn', 'note')),
	CONSTRAINT "gate_policy_versions_flaky_action_ck" CHECK ("gate_policy_versions"."flaky_action" in ('warn', 'note', 'pass'))
);
--> statement-breakpoint
CREATE TABLE "gate_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"gate_policy_version_id" uuid NOT NULL,
	"outcome" "gate_outcome" NOT NULL,
	"decision_engine_version" text NOT NULL,
	"decision_digest" text NOT NULL,
	"blocking_impact_count" integer DEFAULT 0 NOT NULL,
	"warning_impact_count" integer DEFAULT 0 NOT NULL,
	"noted_impact_count" integer DEFAULT 0 NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_decisions_counts_ck" CHECK ("gate_decisions"."blocking_impact_count" >= 0 and "gate_decisions"."warning_impact_count" >= 0 and "gate_decisions"."noted_impact_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gate_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"breaking_change_plan_id" uuid NOT NULL,
	"behavior_definition_id" uuid NOT NULL,
	"github_repository_id" uuid,
	"pull_request_id" uuid,
	"candidate_image_digest" text NOT NULL,
	"status" "gate_exception_status" DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"approved_by_membership_id" uuid,
	"approved_at" timestamp with time zone,
	"recent_auth_at" timestamp with time zone,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_exceptions_reason_ck" CHECK (length(trim("gate_exceptions"."reason")) > 0),
	CONSTRAINT "gate_exceptions_window_ck" CHECK ("gate_exceptions"."valid_until" > "gate_exceptions"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "gate_impacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"gate_decision_id" uuid NOT NULL,
	"replay_delta_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"dependency_claim_id" uuid,
	"assertion_id" uuid,
	"effective_tier" "evidence_tier",
	"action" "gate_outcome" NOT NULL,
	"gate_exception_id" uuid,
	"receipt_id" uuid,
	"reason_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_impacts_exactly_one_target_ck" CHECK (num_nonnulls("gate_impacts"."dependency_claim_id", "gate_impacts"."assertion_id") = 1),
	CONSTRAINT "gate_impacts_tier_target_ck" CHECK (("gate_impacts"."assertion_id" is not null and "gate_impacts"."effective_tier" is null) or ("gate_impacts"."dependency_claim_id" is not null and "gate_impacts"."effective_tier" is not null)),
	CONSTRAINT "gate_impacts_t2_action_ck" CHECK ("gate_impacts"."effective_tier" <> 't2' or "gate_impacts"."action" in ('warn', 'note', 'pass')),
	CONSTRAINT "gate_impacts_t3_action_ck" CHECK ("gate_impacts"."effective_tier" <> 't3' or "gate_impacts"."action" in ('note', 'pass'))
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"status" "integration_status" DEFAULT 'pending' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"installed_by_membership_id" uuid,
	"installed_at" timestamp with time zone NOT NULL,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_id" uuid NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"owner_login" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_repository_id" uuid NOT NULL,
	"github_pull_request_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"head_sha" text NOT NULL,
	"base_sha" text NOT NULL,
	"state" text NOT NULL,
	"is_fork" boolean DEFAULT false NOT NULL,
	"author_login" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"updated_from_github_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_repository_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"github_repository_id" uuid NOT NULL,
	"gate_policy_id" uuid NOT NULL,
	"replay_profile_id" uuid NOT NULL,
	"spec_path" text NOT NULL,
	"workflow_path" text NOT NULL,
	"base_image_build_ref" text NOT NULL,
	"candidate_image_build_ref" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"role" "organization_role" NOT NULL,
	"workos_invitation_id" text NOT NULL,
	"invited_by_membership_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_expiry_ck" CHECK ("invitations"."expires_at" > "invitations"."created_at")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workos_membership_id" text,
	"role" "organization_role" DEFAULT 'viewer' NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"joined_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_key_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purpose" "key_purpose" NOT NULL,
	"version" integer NOT NULL,
	"kms_key_reference" text NOT NULL,
	"status" "key_version_status" DEFAULT 'pending' NOT NULL,
	"activated_at" timestamp with time zone,
	"retire_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_key_versions_version_ck" CHECK ("organization_key_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"default_assertion_days" smallint DEFAULT 90 NOT NULL,
	"default_receipt_ttl_days" smallint DEFAULT 30 NOT NULL,
	"low_volume_sampling_boost" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"notification_digest_enabled" boolean DEFAULT true NOT NULL,
	"data_export_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_settings_assertion_days_ck" CHECK ("organization_settings"."default_assertion_days" > 0),
	CONSTRAINT "organization_settings_receipt_ttl_ck" CHECK ("organization_settings"."default_receipt_ttl_days" > 0),
	CONSTRAINT "organization_settings_boost_ck" CHECK ("organization_settings"."low_volume_sampling_boost" >= 1)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_organization_id" text NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"status" "organization_status" DEFAULT 'provisioning' NOT NULL,
	"region" text DEFAULT 'auto' NOT NULL,
	"retention_days" smallint DEFAULT 30 NOT NULL,
	"stale_after_days" smallint DEFAULT 90 NOT NULL,
	"settings_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_retention_days_ck" CHECK ("organizations"."retention_days" between 1 and 365),
	CONSTRAINT "organizations_stale_after_days_ck" CHECK ("organizations"."stale_after_days" > 0),
	CONSTRAINT "organizations_settings_version_ck" CHECK ("organizations"."settings_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "platform_operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "platform_operator_status" DEFAULT 'active' NOT NULL,
	"capabilities" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "support_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform_operator_id" uuid NOT NULL,
	"approved_by_operator_id" uuid,
	"reason" text NOT NULL,
	"ticket_reference" text NOT NULL,
	"scopes" text[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_access_grants_window_ck" CHECK ("support_access_grants"."expires_at" > "support_access_grants"."starts_at"),
	CONSTRAINT "support_access_grants_approver_ck" CHECK ("support_access_grants"."approved_by_operator_id" is null or "support_access_grants"."approved_by_operator_id" <> "support_access_grants"."platform_operator_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"primary_email" "citext" NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"last_authenticated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "github_check_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_repository_id" uuid NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"gate_decision_id" uuid NOT NULL,
	"github_check_run_id" bigint,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"details_url" text,
	"last_payload_digest" text,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_code" text
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"notification_route_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"membership_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"digest_enabled" boolean DEFAULT true NOT NULL,
	"muted_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_membership_id_event_type_pk" PRIMARY KEY("membership_id","event_type")
);
--> statement-breakpoint
CREATE TABLE "notification_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid,
	"event_type" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"slack_installation_id" uuid,
	"destination_id" text,
	"minimum_severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_routes_channel_ck" CHECK (("notification_routes"."channel" = 'in_app' and "notification_routes"."slack_installation_id" is null and "notification_routes"."destination_id" is null) or ("notification_routes"."channel" = 'slack' and "notification_routes"."slack_installation_id" is not null and length(trim("notification_routes"."destination_id")) > 0))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"target_membership_id" uuid,
	"api_service_id" uuid,
	"assertion_id" uuid,
	"replay_run_id" uuid,
	"gate_decision_id" uuid,
	"event_type" text NOT NULL,
	"severity" "notification_severity" NOT NULL,
	"title" text NOT NULL,
	"body_text" text NOT NULL,
	"deep_link_path" text,
	"deduplication_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "slack_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slack_team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"status" "integration_status" DEFAULT 'pending' NOT NULL,
	"encrypted_bot_token" text NOT NULL,
	"encryption_key_version_id" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"installed_by_membership_id" uuid,
	"installed_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"provider" text NOT NULL,
	"delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_digest" text NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb,
	"payload_object_id" uuid,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"concurrency_key" text,
	"last_error_code" text,
	"last_error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_payload_source_ck" CHECK (num_nonnulls("jobs"."payload", "jobs"."payload_object_id") = 1),
	CONSTRAINT "jobs_payload_object_tenant_ck" CHECK ("jobs"."payload_object_id" is null or "jobs"."organization_id" is not null),
	CONSTRAINT "jobs_attempts_ck" CHECK ("jobs"."attempts" >= 0 and "jobs"."max_attempts" > 0),
	CONSTRAINT "jobs_error_summary_length_ck" CHECK ("jobs"."last_error_summary" is null or length("jobs"."last_error_summary") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"topic" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_digest" text NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_version_ck" CHECK ("outbox_events"."event_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"api_service_id" uuid,
	"task_type" text NOT NULL,
	"schedule_expression" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_enqueued_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"idempotency_seed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_tasks_service_tenant_ck" CHECK ("scheduled_tasks"."api_service_id" is null or "scheduled_tasks"."organization_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "ci_runner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"github_repository_id" uuid,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"nonce_digest" text NOT NULL,
	"report_signing_public_key" text NOT NULL,
	"signing_key_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_corpus_id" uuid NOT NULL,
	"api_operation_id" uuid NOT NULL,
	"consumer_id" uuid NOT NULL,
	"behavior_definition_id" uuid,
	"assertion_id" uuid,
	"coverage_class" "coverage_class" NOT NULL,
	"object_offset" bigint NOT NULL,
	"request_digest" text NOT NULL,
	"method" text NOT NULL,
	"normalized_path" text NOT NULL,
	"safe_method" boolean NOT NULL,
	"requires_fixture" boolean DEFAULT false NOT NULL,
	"selection_reason" text NOT NULL,
	"priority_rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delta_assertion_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_delta_id" uuid NOT NULL,
	"assertion_id" uuid NOT NULL,
	"match_rule_version" text NOT NULL,
	"match_digest" text NOT NULL,
	"matched" boolean NOT NULL,
	"ineligibility_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delta_claim_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_delta_id" uuid NOT NULL,
	"dependency_claim_id" uuid NOT NULL,
	"match_rule_version" text NOT NULL,
	"match_digest" text NOT NULL,
	"matched" boolean NOT NULL,
	"ineligibility_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "replay_status" DEFAULT 'queued' NOT NULL,
	"runner_instance_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"result_digest" text,
	"report_object_id" uuid,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_attempts_number_ck" CHECK ("replay_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "replay_corpora" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "corpus_status" DEFAULT 'building' NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"corpus_digest" text NOT NULL,
	"extractor_release_id" uuid NOT NULL,
	"selection_algorithm_version" text NOT NULL,
	"source_window_start" timestamp with time zone NOT NULL,
	"source_window_end" timestamp with time zone NOT NULL,
	"item_count" integer NOT NULL,
	"operation_count" integer NOT NULL,
	"consumer_count" integer NOT NULL,
	"assertion_count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"supersedes_corpus_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_corpora_window_ck" CHECK ("replay_corpora"."source_window_end" > "replay_corpora"."source_window_start"),
	CONSTRAINT "replay_corpora_counts_ck" CHECK ("replay_corpora"."item_count" >= 0 and "replay_corpora"."operation_count" >= 0 and "replay_corpora"."consumer_count" >= 0 and "replay_corpora"."assertion_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "replay_deltas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"replay_run_id" uuid NOT NULL,
	"api_operation_id" uuid NOT NULL,
	"before_behavior_definition_id" uuid,
	"after_behavior_definition_id" uuid,
	"kind" "behavior_kind" NOT NULL,
	"delta_digest" text NOT NULL,
	"normalized_before" jsonb,
	"normalized_after" jsonb,
	"mask_applied" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stability" "delta_stability" DEFAULT 'pending' NOT NULL,
	"agreeing_attempts" integer DEFAULT 0 NOT NULL,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"quarantine_reason" text,
	"receipt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_deltas_attempt_counts_ck" CHECK ("replay_deltas"."agreeing_attempts" >= 0 and "replay_deltas"."total_attempts" >= "replay_deltas"."agreeing_attempts")
);
--> statement-breakpoint
CREATE TABLE "replay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"replay_corpus_id" uuid NOT NULL,
	"replay_profile_id" uuid NOT NULL,
	"extractor_release_id" uuid NOT NULL,
	"gate_policy_version_id" uuid NOT NULL,
	"github_repository_id" uuid,
	"pull_request_id" uuid,
	"trigger_type" "replay_trigger_type" NOT NULL,
	"trigger_idempotency_key" text NOT NULL,
	"base_image_digest" text NOT NULL,
	"candidate_image_digest" text NOT NULL,
	"fixture_digest" text NOT NULL,
	"mask_digest" text NOT NULL,
	"runner_version" text NOT NULL,
	"status" "replay_status" DEFAULT 'queued' NOT NULL,
	"requested_by_actor_type" "actor_type" NOT NULL,
	"requested_by_actor_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"report_object_id" uuid,
	"report_digest" text,
	"signature_key_id" text,
	"signature_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" "service_status" DEFAULT 'onboarding' NOT NULL,
	"owner_membership_id" uuid NOT NULL,
	"first_capture_at" timestamp with time zone,
	"first_useful_ledger_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extractor_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semantic_version" text NOT NULL,
	"source_commit_sha" text NOT NULL,
	"binary_digest" text NOT NULL,
	"fingerprint_schema_version" integer NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"deprecated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"api_service_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"current_step" text NOT NULL,
	"completed_steps" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"dismissed_steps" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"last_error_code" text,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "environment_kind" NOT NULL,
	"base_url_origin" text,
	"capture_enabled" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"http_method" text NOT NULL,
	"normalized_path_template" text NOT NULL,
	"operation_key" text NOT NULL,
	"display_name" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_spec_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_spec_id" uuid NOT NULL,
	"api_operation_id" uuid NOT NULL,
	"operation_id_text" text,
	"summary" text,
	"normalized_contract" jsonb NOT NULL,
	"contract_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_service_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"source" "api_spec_source" NOT NULL,
	"source_reference" text,
	"original_object_id" uuid NOT NULL,
	"normalized_object_id" uuid NOT NULL,
	"original_digest" text NOT NULL,
	"normalized_digest" text NOT NULL,
	"openapi_version" text NOT NULL,
	"validation_status" "validation_status" DEFAULT 'pending' NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"supersedes_spec_id" uuid,
	"uploaded_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "object_kind" NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"content_encoding" text,
	"byte_size" bigint NOT NULL,
	"sha256_digest" text NOT NULL,
	"encryption_key_version_id" uuid,
	"scan_status" "object_scan_status" DEFAULT 'pending' NOT NULL,
	"scanned_at" timestamp with time zone,
	"scan_failure_code" text,
	"availability_status" "object_availability" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deletion_reason" text,
	"created_by_actor_type" "actor_type" NOT NULL,
	"created_by_actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "generated_drafts_org_id_uq" ON "generated_drafts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_citations_org_id_uq" ON "llm_citations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_runs_org_id_uq" ON "llm_runs" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "assertion_events_org_id_uq" ON "assertion_events" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "assertions_org_id_uq" ON "assertions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "breaking_change_impacts_org_id_uq" ON "breaking_change_impacts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "breaking_change_plans_org_id_uq" ON "breaking_change_plans" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_subject_requests_org_id_uq" ON "data_subject_requests" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_clusters_org_id_uq" ON "behavior_clusters" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_definitions_org_id_uq" ON "behavior_definitions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_labels_org_id_uq" ON "behavior_labels" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_spec_classifications_org_id_uq" ON "behavior_spec_classifications" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_id_uq" ON "agents" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_sessions_org_id_uq" ON "capture_sessions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "consumer_identifiers_org_id_uq" ON "consumer_identifiers" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "consumers_org_id_uq" ON "consumers" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_batches_org_id_uq" ON "ingestion_batches" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_credentials_org_id_uq" ON "machine_credentials" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "mask_profile_versions_org_id_uq" ON "mask_profile_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "redaction_policy_versions_org_id_uq" ON "redaction_policy_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_profiles_org_id_uq" ON "replay_profiles" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sampling_policy_versions_org_id_uq" ON "sampling_policy_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_runs_org_id_uq" ON "evaluation_runs" USING btree ("organization_id","id") WHERE "evaluation_runs"."organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_evidence_org_id_uq" ON "claim_evidence" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_review_decisions_org_id_uq" ON "claim_review_decisions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_claims_org_id_uq" ON "dependency_claims" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_org_id_uq" ON "ledger_entries" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_org_id_uq" ON "receipts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_policies_org_id_uq" ON "gate_policies" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_policy_versions_org_id_uq" ON "gate_policy_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_decisions_org_id_uq" ON "gate_decisions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_exceptions_org_id_uq" ON "gate_exceptions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_impacts_org_id_uq" ON "gate_impacts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_org_id_uq" ON "github_installations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_repositories_org_id_uq" ON "github_repositories" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_requests_org_id_uq" ON "pull_requests" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_repository_connections_org_id_uq" ON "service_repository_connections" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_org_id_uq" ON "invitations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_id_uq" ON "memberships" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_key_versions_org_id_uq" ON "organization_key_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_access_grants_org_id_uq" ON "support_access_grants" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_check_runs_org_id_uq" ON "github_check_runs" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_org_id_uq" ON "notification_deliveries" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_routes_org_id_uq" ON "notification_routes" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_org_id_uq" ON "notifications" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_installations_org_id_uq" ON "slack_installations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runner_sessions_org_id_uq" ON "ci_runner_sessions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "corpus_items_org_id_uq" ON "corpus_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "delta_assertion_matches_org_id_uq" ON "delta_assertion_matches" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "delta_claim_matches_org_id_uq" ON "delta_claim_matches" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_attempts_org_id_uq" ON "replay_attempts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_corpora_org_id_uq" ON "replay_corpora" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_deltas_org_id_uq" ON "replay_deltas" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_runs_org_id_uq" ON "replay_runs" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_services_org_id_uq" ON "api_services" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_progress_org_id_uq" ON "onboarding_progress" USING btree ("organization_id","api_service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_environments_org_id_uq" ON "service_environments" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_operations_org_id_uq" ON "api_operations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_spec_operations_org_id_uq" ON "api_spec_operations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_specs_org_id_uq" ON "api_specs" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_objects_org_id_uq" ON "stored_objects" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_cluster_fk" FOREIGN KEY ("organization_id","behavior_cluster_id") REFERENCES "public"."behavior_clusters"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_break_plan_fk" FOREIGN KEY ("organization_id","breaking_change_plan_id") REFERENCES "public"."breaking_change_plans"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_replay_run_fk" FOREIGN KEY ("organization_id","replay_run_id") REFERENCES "public"."replay_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_gate_decision_fk" FOREIGN KEY ("organization_id","gate_decision_id") REFERENCES "public"."gate_decisions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_llm_run_fk" FOREIGN KEY ("organization_id","llm_run_id") REFERENCES "public"."llm_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_content_object_fk" FOREIGN KEY ("organization_id","content_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_reviewer_fk" FOREIGN KEY ("organization_id","reviewed_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_citations" ADD CONSTRAINT "llm_citations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "llm_citations" ADD CONSTRAINT "llm_citations_run_fk" FOREIGN KEY ("organization_id","llm_run_id") REFERENCES "public"."llm_runs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_citations" ADD CONSTRAINT "llm_citations_receipt_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_citations" ADD CONSTRAINT "llm_citations_claim_fk" FOREIGN KEY ("organization_id","dependency_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_citations" ADD CONSTRAINT "llm_citations_delta_fk" FOREIGN KEY ("organization_id","replay_delta_id") REFERENCES "public"."replay_deltas"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_citations" ADD CONSTRAINT "llm_citations_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_runs" ADD CONSTRAINT "llm_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "llm_runs" ADD CONSTRAINT "llm_runs_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_runs" ADD CONSTRAINT "llm_runs_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertion_consumers" ADD CONSTRAINT "assertion_consumers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assertion_consumers" ADD CONSTRAINT "assertion_consumers_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertion_consumers" ADD CONSTRAINT "assertion_consumers_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertion_events" ADD CONSTRAINT "assertion_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assertion_events" ADD CONSTRAINT "assertion_events_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_source_claim_fk" FOREIGN KEY ("organization_id","source_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_owner_fk" FOREIGN KEY ("organization_id","owner_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_resolver_fk" FOREIGN KEY ("organization_id","resolved_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assertions" ADD CONSTRAINT "assertions_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_impacts" ADD CONSTRAINT "breaking_change_impacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "breaking_change_impacts" ADD CONSTRAINT "breaking_change_impacts_plan_fk" FOREIGN KEY ("organization_id","breaking_change_plan_id") REFERENCES "public"."breaking_change_plans"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_impacts" ADD CONSTRAINT "breaking_change_impacts_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_impacts" ADD CONSTRAINT "breaking_change_impacts_claim_fk" FOREIGN KEY ("organization_id","dependency_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_impacts" ADD CONSTRAINT "breaking_change_impacts_receipt_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_plans" ADD CONSTRAINT "breaking_change_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "breaking_change_plans" ADD CONSTRAINT "breaking_change_plans_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_plans" ADD CONSTRAINT "breaking_change_plans_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_plans" ADD CONSTRAINT "breaking_change_plans_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaking_change_plans" ADD CONSTRAINT "breaking_change_plans_owner_fk" FOREIGN KEY ("organization_id","owner_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_support_grant_fk" FOREIGN KEY ("organization_id","support_access_grant_id") REFERENCES "public"."support_access_grants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_requester_fk" FOREIGN KEY ("organization_id","requested_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_export_object_fk" FOREIGN KEY ("organization_id","export_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_manifest_object_fk" FOREIGN KEY ("organization_id","deletion_manifest_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_cluster_members" ADD CONSTRAINT "behavior_cluster_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "behavior_cluster_members" ADD CONSTRAINT "behavior_cluster_members_cluster_fk" FOREIGN KEY ("organization_id","behavior_cluster_id") REFERENCES "public"."behavior_clusters"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_cluster_members" ADD CONSTRAINT "behavior_cluster_members_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_clusters" ADD CONSTRAINT "behavior_clusters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "behavior_clusters" ADD CONSTRAINT "behavior_clusters_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_clusters" ADD CONSTRAINT "behavior_clusters_llm_run_fk" FOREIGN KEY ("organization_id","llm_run_id") REFERENCES "public"."llm_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_clusters" ADD CONSTRAINT "behavior_clusters_reviewer_fk" FOREIGN KEY ("organization_id","reviewed_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_clusters" ADD CONSTRAINT "behavior_clusters_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_cluster_id") REFERENCES "public"."behavior_clusters"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_definitions" ADD CONSTRAINT "behavior_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "behavior_definitions" ADD CONSTRAINT "behavior_definitions_extractor_release_id_extractor_releases_id_fk" FOREIGN KEY ("extractor_release_id") REFERENCES "public"."extractor_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_definitions" ADD CONSTRAINT "behavior_definitions_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_definitions" ADD CONSTRAINT "behavior_definitions_operation_fk" FOREIGN KEY ("organization_id","api_operation_id") REFERENCES "public"."api_operations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_labels" ADD CONSTRAINT "behavior_labels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "behavior_labels" ADD CONSTRAINT "behavior_labels_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_labels" ADD CONSTRAINT "behavior_labels_llm_run_fk" FOREIGN KEY ("organization_id","llm_run_id") REFERENCES "public"."llm_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_labels" ADD CONSTRAINT "behavior_labels_reviewer_fk" FOREIGN KEY ("organization_id","reviewed_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_labels" ADD CONSTRAINT "behavior_labels_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_label_id") REFERENCES "public"."behavior_labels"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_operation_fk" FOREIGN KEY ("organization_id","api_operation_id") REFERENCES "public"."api_operations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_observations" ADD CONSTRAINT "behavior_observations_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_spec_classifications" ADD CONSTRAINT "behavior_spec_classifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "behavior_spec_classifications" ADD CONSTRAINT "behavior_spec_classifications_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_spec_classifications" ADD CONSTRAINT "behavior_spec_classifications_spec_fk" FOREIGN KEY ("organization_id","api_spec_id") REFERENCES "public"."api_specs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_extractor_release_id_extractor_releases_id_fk" FOREIGN KEY ("extractor_release_id") REFERENCES "public"."extractor_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_redaction_policy_fk" FOREIGN KEY ("organization_id","redaction_policy_version_id") REFERENCES "public"."redaction_policy_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_sampling_policy_fk" FOREIGN KEY ("organization_id","sampling_policy_version_id") REFERENCES "public"."sampling_policy_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_agent_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_batch_fk" FOREIGN KEY ("organization_id","ingestion_batch_id") REFERENCES "public"."ingestion_batches"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_structural_key_fk" FOREIGN KEY ("organization_id","structural_hmac_key_version_id") REFERENCES "public"."organization_key_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_receipt_object_fk" FOREIGN KEY ("organization_id","receipt_bundle_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_identifiers" ADD CONSTRAINT "consumer_identifiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consumer_identifiers" ADD CONSTRAINT "consumer_identifiers_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_identifiers" ADD CONSTRAINT "consumer_identifiers_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_identifiers" ADD CONSTRAINT "consumer_identifiers_key_fk" FOREIGN KEY ("organization_id","consumer_hmac_key_version_id") REFERENCES "public"."organization_key_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumers" ADD CONSTRAINT "consumers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consumers" ADD CONSTRAINT "consumers_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumers" ADD CONSTRAINT "consumers_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_extractor_release_id_extractor_releases_id_fk" FOREIGN KEY ("extractor_release_id") REFERENCES "public"."extractor_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_agent_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_object_fk" FOREIGN KEY ("organization_id","stored_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_rejection_object_fk" FOREIGN KEY ("organization_id","rejection_manifest_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_redaction_policy_fk" FOREIGN KEY ("organization_id","redaction_policy_version_id") REFERENCES "public"."redaction_policy_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_sampling_policy_fk" FOREIGN KEY ("organization_id","sampling_policy_version_id") REFERENCES "public"."sampling_policy_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_credentials" ADD CONSTRAINT "machine_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "machine_credentials" ADD CONSTRAINT "machine_credentials_agent_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_credentials" ADD CONSTRAINT "machine_credentials_rotated_from_fk" FOREIGN KEY ("organization_id","rotated_from_id") REFERENCES "public"."machine_credentials"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mask_profile_versions" ADD CONSTRAINT "mask_profile_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mask_profile_versions" ADD CONSTRAINT "mask_profile_versions_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mask_profile_versions" ADD CONSTRAINT "mask_profile_versions_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_policy_versions" ADD CONSTRAINT "redaction_policy_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "redaction_policy_versions" ADD CONSTRAINT "redaction_policy_versions_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_policy_versions" ADD CONSTRAINT "redaction_policy_versions_structural_key_fk" FOREIGN KEY ("organization_id","structural_hmac_key_version_id") REFERENCES "public"."organization_key_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_policy_versions" ADD CONSTRAINT "redaction_policy_versions_consumer_key_fk" FOREIGN KEY ("organization_id","consumer_hmac_key_version_id") REFERENCES "public"."organization_key_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_policy_versions" ADD CONSTRAINT "redaction_policy_versions_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_profiles" ADD CONSTRAINT "replay_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replay_profiles" ADD CONSTRAINT "replay_profiles_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_profiles" ADD CONSTRAINT "replay_profiles_mask_fk" FOREIGN KEY ("organization_id","mask_profile_version_id") REFERENCES "public"."mask_profile_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_profiles" ADD CONSTRAINT "replay_profiles_fixture_fk" FOREIGN KEY ("organization_id","fixture_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_profiles" ADD CONSTRAINT "replay_profiles_stub_fk" FOREIGN KEY ("organization_id","stub_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sampling_policy_versions" ADD CONSTRAINT "sampling_policy_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sampling_policy_versions" ADD CONSTRAINT "sampling_policy_versions_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sampling_policy_versions" ADD CONSTRAINT "sampling_policy_versions_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_datasets" ADD CONSTRAINT "evaluation_datasets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "evaluation_datasets" ADD CONSTRAINT "evaluation_datasets_object_fk" FOREIGN KEY ("organization_id","stored_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_metrics" ADD CONSTRAINT "evaluation_metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "evaluation_metrics" ADD CONSTRAINT "evaluation_metrics_evaluation_run_id_evaluation_runs_id_fk" FOREIGN KEY ("evaluation_run_id") REFERENCES "public"."evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_evaluation_dataset_id_evaluation_datasets_id_fk" FOREIGN KEY ("evaluation_dataset_id") REFERENCES "public"."evaluation_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_extractor_release_id_extractor_releases_id_fk" FOREIGN KEY ("extractor_release_id") REFERENCES "public"."extractor_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_result_object_fk" FOREIGN KEY ("organization_id","result_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claim_fk" FOREIGN KEY ("organization_id","dependency_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_receipt_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_structural_key_fk" FOREIGN KEY ("organization_id","structural_hmac_key_version_id") REFERENCES "public"."organization_key_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_review_decisions" ADD CONSTRAINT "claim_review_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "claim_review_decisions" ADD CONSTRAINT "claim_review_decisions_claim_fk" FOREIGN KEY ("organization_id","dependency_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_review_decisions" ADD CONSTRAINT "claim_review_decisions_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_review_decisions" ADD CONSTRAINT "claim_review_decisions_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_decision_id") REFERENCES "public"."claim_review_decisions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_claims" ADD CONSTRAINT "dependency_claims_llm_run_fk" FOREIGN KEY ("organization_id","llm_run_id") REFERENCES "public"."llm_runs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_claim_fk" FOREIGN KEY ("organization_id","dependency_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_owner_fk" FOREIGN KEY ("organization_id","owner_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_extractor_release_id_extractor_releases_id_fk" FOREIGN KEY ("extractor_release_id") REFERENCES "public"."extractor_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_session_fk" FOREIGN KEY ("organization_id","capture_session_id") REFERENCES "public"."capture_sessions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_object_fk" FOREIGN KEY ("organization_id","stored_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_redaction_policy_fk" FOREIGN KEY ("organization_id","redaction_policy_version_id") REFERENCES "public"."redaction_policy_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_policies" ADD CONSTRAINT "gate_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "gate_policies" ADD CONSTRAINT "gate_policies_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_policies" ADD CONSTRAINT "gate_policies_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_policy_versions" ADD CONSTRAINT "gate_policy_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "gate_policy_versions" ADD CONSTRAINT "gate_policy_versions_policy_fk" FOREIGN KEY ("organization_id","gate_policy_id") REFERENCES "public"."gate_policies"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_policy_versions" ADD CONSTRAINT "gate_policy_versions_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD CONSTRAINT "gate_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD CONSTRAINT "gate_decisions_run_fk" FOREIGN KEY ("organization_id","replay_run_id") REFERENCES "public"."replay_runs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD CONSTRAINT "gate_decisions_policy_version_fk" FOREIGN KEY ("organization_id","gate_policy_version_id") REFERENCES "public"."gate_policy_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_plan_fk" FOREIGN KEY ("organization_id","breaking_change_plan_id") REFERENCES "public"."breaking_change_plans"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_repository_fk" FOREIGN KEY ("organization_id","github_repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_pull_request_fk" FOREIGN KEY ("organization_id","pull_request_id") REFERENCES "public"."pull_requests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_requester_fk" FOREIGN KEY ("organization_id","requested_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_exceptions" ADD CONSTRAINT "gate_exceptions_approver_fk" FOREIGN KEY ("organization_id","approved_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_decision_fk" FOREIGN KEY ("organization_id","gate_decision_id") REFERENCES "public"."gate_decisions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_delta_fk" FOREIGN KEY ("organization_id","replay_delta_id") REFERENCES "public"."replay_deltas"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_claim_fk" FOREIGN KEY ("organization_id","dependency_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_exception_fk" FOREIGN KEY ("organization_id","gate_exception_id") REFERENCES "public"."gate_exceptions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_impacts" ADD CONSTRAINT "gate_impacts_receipt_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_installer_fk" FOREIGN KEY ("organization_id","installed_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installation_fk" FOREIGN KEY ("organization_id","github_installation_id") REFERENCES "public"."github_installations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_fk" FOREIGN KEY ("organization_id","github_repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_repository_connections" ADD CONSTRAINT "service_repository_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "service_repository_connections" ADD CONSTRAINT "service_repository_connections_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_repository_connections" ADD CONSTRAINT "service_repository_connections_repository_fk" FOREIGN KEY ("organization_id","github_repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_repository_connections" ADD CONSTRAINT "service_repository_connections_policy_fk" FOREIGN KEY ("organization_id","gate_policy_id") REFERENCES "public"."gate_policies"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_repository_connections" ADD CONSTRAINT "service_repository_connections_profile_fk" FOREIGN KEY ("organization_id","replay_profile_id") REFERENCES "public"."replay_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_fk" FOREIGN KEY ("organization_id","invited_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_key_versions" ADD CONSTRAINT "organization_key_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "platform_operators" ADD CONSTRAINT "platform_operators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_platform_operator_id_platform_operators_id_fk" FOREIGN KEY ("platform_operator_id") REFERENCES "public"."platform_operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_approved_by_operator_id_platform_operators_id_fk" FOREIGN KEY ("approved_by_operator_id") REFERENCES "public"."platform_operators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_check_runs" ADD CONSTRAINT "github_check_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "github_check_runs" ADD CONSTRAINT "github_check_runs_repository_fk" FOREIGN KEY ("organization_id","github_repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_check_runs" ADD CONSTRAINT "github_check_runs_pull_request_fk" FOREIGN KEY ("organization_id","pull_request_id") REFERENCES "public"."pull_requests"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_check_runs" ADD CONSTRAINT "github_check_runs_replay_run_fk" FOREIGN KEY ("organization_id","replay_run_id") REFERENCES "public"."replay_runs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_check_runs" ADD CONSTRAINT "github_check_runs_gate_decision_fk" FOREIGN KEY ("organization_id","gate_decision_id") REFERENCES "public"."gate_decisions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_fk" FOREIGN KEY ("organization_id","notification_id") REFERENCES "public"."notifications"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_route_fk" FOREIGN KEY ("organization_id","notification_route_id") REFERENCES "public"."notification_routes"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_routes" ADD CONSTRAINT "notification_routes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notification_routes" ADD CONSTRAINT "notification_routes_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_routes" ADD CONSTRAINT "notification_routes_slack_fk" FOREIGN KEY ("organization_id","slack_installation_id") REFERENCES "public"."slack_installations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_routes" ADD CONSTRAINT "notification_routes_creator_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_membership_fk" FOREIGN KEY ("organization_id","target_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_replay_run_fk" FOREIGN KEY ("organization_id","replay_run_id") REFERENCES "public"."replay_runs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_gate_decision_fk" FOREIGN KEY ("organization_id","gate_decision_id") REFERENCES "public"."gate_decisions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_key_fk" FOREIGN KEY ("organization_id","encryption_key_version_id") REFERENCES "public"."organization_key_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_installer_fk" FOREIGN KEY ("organization_id","installed_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_payload_object_fk" FOREIGN KEY ("organization_id","payload_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runner_sessions" ADD CONSTRAINT "ci_runner_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ci_runner_sessions" ADD CONSTRAINT "ci_runner_sessions_run_fk" FOREIGN KEY ("organization_id","replay_run_id") REFERENCES "public"."replay_runs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runner_sessions" ADD CONSTRAINT "ci_runner_sessions_repository_fk" FOREIGN KEY ("organization_id","github_repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_corpus_fk" FOREIGN KEY ("organization_id","replay_corpus_id") REFERENCES "public"."replay_corpora"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_operation_fk" FOREIGN KEY ("organization_id","api_operation_id") REFERENCES "public"."api_operations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_consumer_fk" FOREIGN KEY ("organization_id","consumer_id") REFERENCES "public"."consumers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_behavior_fk" FOREIGN KEY ("organization_id","behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_items" ADD CONSTRAINT "corpus_items_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delta_assertion_matches" ADD CONSTRAINT "delta_assertion_matches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "delta_assertion_matches" ADD CONSTRAINT "delta_assertion_matches_delta_fk" FOREIGN KEY ("organization_id","replay_delta_id") REFERENCES "public"."replay_deltas"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delta_assertion_matches" ADD CONSTRAINT "delta_assertion_matches_assertion_fk" FOREIGN KEY ("organization_id","assertion_id") REFERENCES "public"."assertions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delta_claim_matches" ADD CONSTRAINT "delta_claim_matches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "delta_claim_matches" ADD CONSTRAINT "delta_claim_matches_delta_fk" FOREIGN KEY ("organization_id","replay_delta_id") REFERENCES "public"."replay_deltas"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delta_claim_matches" ADD CONSTRAINT "delta_claim_matches_claim_fk" FOREIGN KEY ("organization_id","dependency_claim_id") REFERENCES "public"."dependency_claims"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_attempts" ADD CONSTRAINT "replay_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replay_attempts" ADD CONSTRAINT "replay_attempts_run_fk" FOREIGN KEY ("organization_id","replay_run_id") REFERENCES "public"."replay_runs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_attempts" ADD CONSTRAINT "replay_attempts_report_object_fk" FOREIGN KEY ("organization_id","report_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD CONSTRAINT "replay_corpora_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD CONSTRAINT "replay_corpora_extractor_release_id_extractor_releases_id_fk" FOREIGN KEY ("extractor_release_id") REFERENCES "public"."extractor_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD CONSTRAINT "replay_corpora_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD CONSTRAINT "replay_corpora_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD CONSTRAINT "replay_corpora_object_fk" FOREIGN KEY ("organization_id","stored_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_corpora" ADD CONSTRAINT "replay_corpora_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_corpus_id") REFERENCES "public"."replay_corpora"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_run_fk" FOREIGN KEY ("organization_id","replay_run_id") REFERENCES "public"."replay_runs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_operation_fk" FOREIGN KEY ("organization_id","api_operation_id") REFERENCES "public"."api_operations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_before_behavior_fk" FOREIGN KEY ("organization_id","before_behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_after_behavior_fk" FOREIGN KEY ("organization_id","after_behavior_definition_id") REFERENCES "public"."behavior_definitions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_deltas" ADD CONSTRAINT "replay_deltas_receipt_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_extractor_release_id_extractor_releases_id_fk" FOREIGN KEY ("extractor_release_id") REFERENCES "public"."extractor_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_environment_fk" FOREIGN KEY ("organization_id","environment_id") REFERENCES "public"."service_environments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_corpus_fk" FOREIGN KEY ("organization_id","replay_corpus_id") REFERENCES "public"."replay_corpora"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_profile_fk" FOREIGN KEY ("organization_id","replay_profile_id") REFERENCES "public"."replay_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_policy_version_fk" FOREIGN KEY ("organization_id","gate_policy_version_id") REFERENCES "public"."gate_policy_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_repository_fk" FOREIGN KEY ("organization_id","github_repository_id") REFERENCES "public"."github_repositories"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_pull_request_fk" FOREIGN KEY ("organization_id","pull_request_id") REFERENCES "public"."pull_requests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_report_object_fk" FOREIGN KEY ("organization_id","report_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_services" ADD CONSTRAINT "api_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "api_services" ADD CONSTRAINT "api_services_owner_fk" FOREIGN KEY ("organization_id","owner_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_environments" ADD CONSTRAINT "service_environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "service_environments" ADD CONSTRAINT "service_environments_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_operations" ADD CONSTRAINT "api_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "api_operations" ADD CONSTRAINT "api_operations_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_spec_operations" ADD CONSTRAINT "api_spec_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "api_spec_operations" ADD CONSTRAINT "api_spec_operations_spec_fk" FOREIGN KEY ("organization_id","api_spec_id") REFERENCES "public"."api_specs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_spec_operations" ADD CONSTRAINT "api_spec_operations_operation_fk" FOREIGN KEY ("organization_id","api_operation_id") REFERENCES "public"."api_operations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_service_fk" FOREIGN KEY ("organization_id","api_service_id") REFERENCES "public"."api_services"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_original_object_fk" FOREIGN KEY ("organization_id","original_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_normalized_object_fk" FOREIGN KEY ("organization_id","normalized_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_uploader_fk" FOREIGN KEY ("organization_id","uploaded_by_membership_id") REFERENCES "public"."memberships"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_spec_id") REFERENCES "public"."api_specs"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_encryption_key_fk" FOREIGN KEY ("organization_id","encryption_key_version_id") REFERENCES "public"."organization_key_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_drafts_subject_idx" ON "generated_drafts" USING btree ("organization_id","api_service_id","draft_type");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_runs_successful_cache_uq" ON "llm_runs" USING btree ("organization_id","task_type","prompt_version_id","cache_key") WHERE "llm_runs"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "llm_runs_org_created_idx" ON "llm_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_task_version_uq" ON "prompt_versions" USING btree ("task_type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_active_uq" ON "prompt_versions" USING btree ("task_type") WHERE "prompt_versions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "assertion_events_assertion_time_idx" ON "assertion_events" USING btree ("assertion_id","created_at");--> statement-breakpoint
CREATE INDEX "assertions_active_expiry_idx" ON "assertions" USING btree ("organization_id","expires_at") WHERE "assertions"."status" in ('active', 'expiring');--> statement-breakpoint
CREATE UNIQUE INDEX "breaking_change_impacts_plan_consumer_uq" ON "breaking_change_impacts" USING btree ("breaking_change_plan_id","consumer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "breaking_change_plans_assertion_uq" ON "breaking_change_plans" USING btree ("assertion_id");--> statement-breakpoint
CREATE INDEX "breaking_change_plans_actionable_idx" ON "breaking_change_plans" USING btree ("organization_id","status","planned_for");--> statement-breakpoint
CREATE INDEX "audit_events_org_time_idx" ON "audit_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("organization_id","resource_type","resource_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_time_idx" ON "audit_events" USING btree ("organization_id","actor_type","actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "data_subject_requests_status_idx" ON "data_subject_requests" USING btree ("organization_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "platform_audit_events_resource_idx" ON "platform_audit_events" USING btree ("resource_type","resource_id","occurred_at");--> statement-breakpoint
CREATE INDEX "platform_audit_events_actor_idx" ON "platform_audit_events" USING btree ("actor_type","actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "behavior_clusters_service_status_idx" ON "behavior_clusters" USING btree ("api_service_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_definitions_identity_uq" ON "behavior_definitions" USING btree ("api_operation_id","extractor_release_id","fingerprint_digest");--> statement-breakpoint
CREATE INDEX "behavior_definitions_operation_kind_idx" ON "behavior_definitions" USING btree ("api_operation_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_labels_active_uq" ON "behavior_labels" USING btree ("behavior_definition_id") WHERE "behavior_labels"."status" = 'active';--> statement-breakpoint
CREATE INDEX "behavior_labels_label_trgm_idx" ON "behavior_labels" USING gin ("label" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_observations_dimensions_uq" ON "behavior_observations" USING btree ("bucket_start","environment_id","api_operation_id","consumer_id","behavior_definition_id");--> statement-breakpoint
CREATE INDEX "behavior_observations_behavior_consumer_time_idx" ON "behavior_observations" USING btree ("organization_id","behavior_definition_id","consumer_id","bucket_start");--> statement-breakpoint
CREATE INDEX "behavior_observations_operation_time_idx" ON "behavior_observations" USING btree ("organization_id","api_operation_id","bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "behavior_spec_classifications_identity_uq" ON "behavior_spec_classifications" USING btree ("behavior_definition_id","api_spec_id","comparator_version");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_external_instance_uq" ON "agents" USING btree ("organization_id","external_instance_key");--> statement-breakpoint
CREATE INDEX "agents_environment_health_idx" ON "agents" USING btree ("environment_id","status","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_sessions_identity_uq" ON "capture_sessions" USING btree ("environment_id","consumer_id","session_hmac","started_at");--> statement-breakpoint
CREATE INDEX "capture_sessions_consumer_time_idx" ON "capture_sessions" USING btree ("organization_id","consumer_id","started_at");--> statement-breakpoint
CREATE INDEX "capture_sessions_expiry_idx" ON "capture_sessions" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consumer_identifiers_resolution_uq" ON "consumer_identifiers" USING btree ("environment_id","consumer_hmac_key_version_id","identifier_hmac");--> statement-breakpoint
CREATE UNIQUE INDEX "consumer_identifiers_primary_uq" ON "consumer_identifiers" USING btree ("consumer_id","consumer_hmac_key_version_id") WHERE "consumer_identifiers"."is_primary" and "consumer_identifiers"."retired_at" is null;--> statement-breakpoint
CREATE INDEX "consumer_identifiers_lookup_idx" ON "consumer_identifiers" USING btree ("organization_id","environment_id","consumer_hmac_key_version_id","identifier_hmac");--> statement-breakpoint
CREATE INDEX "consumers_environment_seen_idx" ON "consumers" USING btree ("environment_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "consumers_alias_idx" ON "consumers" USING gin ("display_alias" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_batches_agent_batch_uq" ON "ingestion_batches" USING btree ("agent_id","agent_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_batches_digest_agent_uq" ON "ingestion_batches" USING btree ("organization_id","payload_digest","agent_id");--> statement-breakpoint
CREATE INDEX "ingestion_batches_processing_idx" ON "ingestion_batches" USING btree ("organization_id","status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_credentials_token_prefix_uq" ON "machine_credentials" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "machine_credentials_agent_idx" ON "machine_credentials" USING btree ("agent_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mask_profile_versions_service_version_uq" ON "mask_profile_versions" USING btree ("api_service_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "mask_profile_versions_active_uq" ON "mask_profile_versions" USING btree ("api_service_id") WHERE "mask_profile_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "redaction_policy_versions_service_version_uq" ON "redaction_policy_versions" USING btree ("api_service_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "redaction_policy_versions_active_uq" ON "redaction_policy_versions" USING btree ("api_service_id") WHERE "redaction_policy_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "replay_profiles_service_version_uq" ON "replay_profiles" USING btree ("api_service_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_profiles_active_uq" ON "replay_profiles" USING btree ("api_service_id") WHERE "replay_profiles"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "sampling_policy_versions_service_version_uq" ON "sampling_policy_versions" USING btree ("api_service_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "sampling_policy_versions_active_uq" ON "sampling_policy_versions" USING btree ("api_service_id") WHERE "sampling_policy_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_datasets_scope_owner_name_version_uq" ON "evaluation_datasets" USING btree ("scope",coalesce("organization_id"::text, '__global__'),"name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_datasets_digest_uq" ON "evaluation_datasets" USING btree ("dataset_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_metrics_all_dimensions_uq" ON "evaluation_metrics" USING btree ("evaluation_run_id","metric_name","behavior_kind","evidence_tier") WHERE "evaluation_metrics"."behavior_kind" is not null and "evaluation_metrics"."evidence_tier" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_metrics_behavior_dimension_uq" ON "evaluation_metrics" USING btree ("evaluation_run_id","metric_name","behavior_kind") WHERE "evaluation_metrics"."behavior_kind" is not null and "evaluation_metrics"."evidence_tier" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_metrics_tier_dimension_uq" ON "evaluation_metrics" USING btree ("evaluation_run_id","metric_name","evidence_tier") WHERE "evaluation_metrics"."behavior_kind" is null and "evaluation_metrics"."evidence_tier" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_metrics_unscoped_uq" ON "evaluation_metrics" USING btree ("evaluation_run_id","metric_name") WHERE "evaluation_metrics"."behavior_kind" is null and "evaluation_metrics"."evidence_tier" is null;--> statement-breakpoint
CREATE INDEX "evaluation_metrics_name_idx" ON "evaluation_metrics" USING btree ("metric_name","created_at");--> statement-breakpoint
CREATE INDEX "evaluation_runs_status_idx" ON "evaluation_runs" USING btree ("scope","status","created_at");--> statement-breakpoint
CREATE INDEX "claim_review_decisions_claim_time_idx" ON "claim_review_decisions" USING btree ("dependency_claim_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_claims_active_uq" ON "dependency_claims" USING btree ("behavior_definition_id","consumer_id") WHERE "dependency_claims"."status" = 'active' and "dependency_claims"."effective_until" is null;--> statement-breakpoint
CREATE INDEX "dependency_claims_consumer_tier_idx" ON "dependency_claims" USING btree ("organization_id","consumer_id","tier","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_claim_uq" ON "ledger_entries" USING btree ("dependency_claim_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_filters_idx" ON "ledger_entries" USING btree ("organization_id","freshness_status","review_state","last_observed_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_search_idx" ON "ledger_entries" USING gin ("search_document");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_bundle_digest_uq" ON "receipts" USING btree ("organization_id","bundle_digest");--> statement-breakpoint
CREATE INDEX "receipts_claim_lookup_idx" ON "receipts" USING btree ("organization_id","consumer_id","receipt_type","created_at");--> statement-breakpoint
CREATE INDEX "receipts_expiry_idx" ON "receipts" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_policies_active_name_uq" ON "gate_policies" USING btree ("api_service_id","name") WHERE "gate_policies"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "gate_policies_default_uq" ON "gate_policies" USING btree ("api_service_id") WHERE "gate_policies"."is_default" and "gate_policies"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "gate_policy_versions_policy_version_uq" ON "gate_policy_versions" USING btree ("gate_policy_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_policy_versions_active_uq" ON "gate_policy_versions" USING btree ("gate_policy_id") WHERE "gate_policy_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "gate_decisions_replay_run_uq" ON "gate_decisions" USING btree ("replay_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_decisions_digest_uq" ON "gate_decisions" USING btree ("organization_id","decision_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_exceptions_active_exact_uq" ON "gate_exceptions" USING btree ("breaking_change_plan_id","behavior_definition_id","candidate_image_digest") WHERE "gate_exceptions"."status" in ('pending', 'approved');--> statement-breakpoint
CREATE INDEX "gate_exceptions_validity_idx" ON "gate_exceptions" USING btree ("organization_id","status","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_impacts_claim_target_uq" ON "gate_impacts" USING btree ("gate_decision_id","replay_delta_id","consumer_id","dependency_claim_id") WHERE "gate_impacts"."dependency_claim_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "gate_impacts_assertion_target_uq" ON "gate_impacts" USING btree ("gate_decision_id","replay_delta_id","consumer_id","assertion_id") WHERE "gate_impacts"."assertion_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "gate_impacts_exception_single_use_uq" ON "gate_impacts" USING btree ("gate_exception_id") WHERE "gate_impacts"."gate_exception_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_external_id_uq" ON "github_installations" USING btree ("github_installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_repositories_external_uq" ON "github_repositories" USING btree ("github_installation_id","github_repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_requests_repo_number_uq" ON "pull_requests" USING btree ("github_repository_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_requests_external_uq" ON "pull_requests" USING btree ("github_repository_id","github_pull_request_id");--> statement-breakpoint
CREATE INDEX "pull_requests_repo_head_idx" ON "pull_requests" USING btree ("github_repository_id","head_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "service_repository_connections_active_uq" ON "service_repository_connections" USING btree ("api_service_id","github_repository_id","spec_path") WHERE "service_repository_connections"."active" and "service_repository_connections"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_workos_id_uq" ON "invitations" USING btree ("workos_invitation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email_uq" ON "invitations" USING btree ("organization_id","email") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_workos_id_uq" ON "memberships" USING btree ("workos_membership_id") WHERE "memberships"."workos_membership_id" is not null;--> statement-breakpoint
CREATE INDEX "memberships_user_status_idx" ON "memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "memberships_org_role_status_idx" ON "memberships" USING btree ("organization_id","role","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_key_versions_version_uq" ON "organization_key_versions" USING btree ("organization_id","purpose","version");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_key_versions_active_uq" ON "organization_key_versions" USING btree ("organization_id","purpose") WHERE "organization_key_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_workos_id_uq" ON "organizations" USING btree ("workos_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_active_idx" ON "organizations" USING btree ("status") WHERE "organizations"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_operators_user_uq" ON "platform_operators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_access_grants_active_idx" ON "support_access_grants" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_workos_id_uq" ON "users" USING btree ("workos_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_check_runs_external_id_uq" ON "github_check_runs" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_check_runs_replay_run_uq" ON "github_check_runs" USING btree ("replay_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_notification_route_uq" ON "notification_deliveries" USING btree ("notification_id","notification_route_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_idx" ON "notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_routes_service_in_app_uq" ON "notification_routes" USING btree ("organization_id","api_service_id","event_type","channel") WHERE "notification_routes"."enabled" and "notification_routes"."api_service_id" is not null and "notification_routes"."channel" = 'in_app';--> statement-breakpoint
CREATE UNIQUE INDEX "notification_routes_org_in_app_uq" ON "notification_routes" USING btree ("organization_id","event_type","channel") WHERE "notification_routes"."enabled" and "notification_routes"."api_service_id" is null and "notification_routes"."channel" = 'in_app';--> statement-breakpoint
CREATE UNIQUE INDEX "notification_routes_service_slack_uq" ON "notification_routes" USING btree ("organization_id","api_service_id","event_type","channel","slack_installation_id","destination_id") WHERE "notification_routes"."enabled" and "notification_routes"."api_service_id" is not null and "notification_routes"."channel" = 'slack';--> statement-breakpoint
CREATE UNIQUE INDEX "notification_routes_org_slack_uq" ON "notification_routes" USING btree ("organization_id","event_type","channel","slack_installation_id","destination_id") WHERE "notification_routes"."enabled" and "notification_routes"."api_service_id" is null and "notification_routes"."channel" = 'slack';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_deduplication_uq" ON "notifications" USING btree ("organization_id","deduplication_key");--> statement-breakpoint
CREATE INDEX "notifications_inbox_idx" ON "notifications" USING btree ("organization_id","target_membership_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_installations_team_uq" ON "slack_installations" USING btree ("organization_id","slack_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_provider_delivery_uq" ON "webhook_deliveries" USING btree ("provider","delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_pending_idx" ON "webhook_deliveries" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_tenant_idempotency_uq" ON "jobs" USING btree (coalesce("organization_id"::text, '__platform__'),"idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_after","priority","lease_expires_at");--> statement-breakpoint
CREATE INDEX "jobs_tenant_fairness_idx" ON "jobs" USING btree ("organization_id","concurrency_key","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_aggregate_version_uq" ON "outbox_events" USING btree (coalesce("organization_id"::text, '__platform__'),"aggregate_type","aggregate_id","event_version");--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" USING btree ("available_at","lease_expires_at") WHERE "outbox_events"."published_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_tasks_target_type_uq" ON "scheduled_tasks" USING btree (coalesce("organization_id"::text, '__platform__'),coalesce("api_service_id"::text, '__all__'),"task_type");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_due_idx" ON "scheduled_tasks" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runner_sessions_token_prefix_uq" ON "ci_runner_sessions" USING btree ("token_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runner_sessions_active_run_uq" ON "ci_runner_sessions" USING btree ("replay_run_id") WHERE "ci_runner_sessions"."consumed_at" is null and "ci_runner_sessions"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "corpus_items_request_class_uq" ON "corpus_items" USING btree ("replay_corpus_id","request_digest","coverage_class");--> statement-breakpoint
CREATE INDEX "corpus_items_coverage_idx" ON "corpus_items" USING btree ("replay_corpus_id","api_operation_id","consumer_id","coverage_class");--> statement-breakpoint
CREATE UNIQUE INDEX "delta_assertion_matches_identity_uq" ON "delta_assertion_matches" USING btree ("replay_delta_id","assertion_id","match_rule_version");--> statement-breakpoint
CREATE UNIQUE INDEX "delta_claim_matches_identity_uq" ON "delta_claim_matches" USING btree ("replay_delta_id","dependency_claim_id","match_rule_version");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_attempts_run_number_uq" ON "replay_attempts" USING btree ("replay_run_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_corpora_environment_version_uq" ON "replay_corpora" USING btree ("environment_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_corpora_digest_uq" ON "replay_corpora" USING btree ("organization_id","corpus_digest");--> statement-breakpoint
CREATE INDEX "replay_corpora_expiry_idx" ON "replay_corpora" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_deltas_run_digest_uq" ON "replay_deltas" USING btree ("replay_run_id","delta_digest");--> statement-breakpoint
CREATE INDEX "replay_deltas_run_stability_idx" ON "replay_deltas" USING btree ("replay_run_id","stability");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_runs_immutable_input_uq" ON "replay_runs" USING btree ("organization_id","replay_corpus_id","replay_profile_id","extractor_release_id","gate_policy_version_id","base_image_digest","candidate_image_digest","fixture_digest","mask_digest","trigger_type","trigger_idempotency_key");--> statement-breakpoint
CREATE INDEX "replay_runs_service_created_idx" ON "replay_runs" USING btree ("organization_id","api_service_id","created_at");--> statement-breakpoint
CREATE INDEX "replay_runs_pr_idx" ON "replay_runs" USING btree ("organization_id","github_repository_id","pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_services_active_slug_uq" ON "api_services" USING btree ("organization_id","slug") WHERE "api_services"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "api_services_org_status_idx" ON "api_services" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "extractor_releases_semver_uq" ON "extractor_releases" USING btree ("semantic_version");--> statement-breakpoint
CREATE UNIQUE INDEX "extractor_releases_binary_digest_uq" ON "extractor_releases" USING btree ("binary_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "service_environments_slug_uq" ON "service_environments" USING btree ("api_service_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "service_environments_default_uq" ON "service_environments" USING btree ("api_service_id") WHERE "service_environments"."is_default" and "service_environments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "api_operations_identity_uq" ON "api_operations" USING btree ("api_service_id","http_method","normalized_path_template");--> statement-breakpoint
CREATE UNIQUE INDEX "api_operations_key_uq" ON "api_operations" USING btree ("api_service_id","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "api_spec_operations_spec_operation_uq" ON "api_spec_operations" USING btree ("api_spec_id","api_operation_id");--> statement-breakpoint
CREATE INDEX "api_spec_operations_operation_idx" ON "api_spec_operations" USING btree ("api_operation_id","api_spec_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_specs_service_digest_uq" ON "api_specs" USING btree ("api_service_id","normalized_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "api_specs_current_uq" ON "api_specs" USING btree ("api_service_id") WHERE "api_specs"."is_current";--> statement-breakpoint
CREATE INDEX "api_specs_service_created_idx" ON "api_specs" USING btree ("api_service_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_objects_bucket_key_uq" ON "stored_objects" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_objects_safe_dedup_uq" ON "stored_objects" USING btree ("organization_id","kind","sha256_digest") WHERE "stored_objects"."deleted_at" is null and "stored_objects"."availability_status" <> 'quarantined';--> statement-breakpoint
CREATE INDEX "stored_objects_expiry_idx" ON "stored_objects" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE INDEX "stored_objects_pending_scan_idx" ON "stored_objects" USING btree ("organization_id","created_at") WHERE "stored_objects"."scan_status" = 'pending';--> statement-breakpoint
CREATE INDEX "stored_objects_availability_idx" ON "stored_objects" USING btree ("organization_id","availability_status");
