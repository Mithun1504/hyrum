import { pgEnum } from "drizzle-orm/pg-core";

export const organizationStatus = pgEnum("organization_status", [
  "provisioning",
  "active",
  "suspended",
  "deleting",
  "deleted",
]);
export const organizationRole = pgEnum("organization_role", [
  "owner",
  "admin",
  "engineer",
  "viewer",
]);
export const membershipStatus = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);
export const serviceStatus = pgEnum("service_status", [
  "onboarding",
  "active",
  "paused",
  "archived",
]);
export const environmentKind = pgEnum("environment_kind", [
  "production",
  "staging",
  "development",
  "demo",
]);
export const agentStatus = pgEnum("agent_status", [
  "pending",
  "online",
  "degraded",
  "offline",
  "revoked",
]);
export const objectKind = pgEnum("object_kind", [
  "api_spec",
  "capture_batch",
  "receipt_bundle",
  "replay_corpus",
  "replay_report",
  "fixture_bundle",
  "generated_artifact",
  "evaluation_dataset",
  "deletion_manifest",
]);
export const objectAvailability = pgEnum("object_availability", [
  "pending",
  "available",
  "expired",
  "quarantined",
  "deleted",
  "failed",
]);
export const objectScanStatus = pgEnum("object_scan_status", [
  "not_required",
  "pending",
  "clean",
  "infected",
  "failed",
]);
export const behaviorKind = pgEnum("behavior_kind", ["shape", "ordering", "error_template"]);
export const declarationStatus = pgEnum("declaration_status", [
  "undeclared",
  "declared",
  "partially_declared",
  "not_applicable",
]);
export const evidenceTier = pgEnum("evidence_tier", ["t1", "t2", "t3"]);
export const claimStatus = pgEnum("claim_status", [
  "proposed",
  "active",
  "disputed",
  "dismissed",
  "stale",
  "superseded",
]);
export const reviewState = pgEnum("review_state", [
  "unreviewed",
  "confirmed",
  "demoted",
  "promoted",
  "dismissed",
]);
export const freshnessStatus = pgEnum("freshness_status", ["fresh", "aging", "stale"]);
export const assertionStatus = pgEnum("assertion_status", [
  "active",
  "expiring",
  "expired",
  "resolved",
  "cancelled",
]);
export const assertionResolution = pgEnum("assertion_resolution", [
  "documented",
  "extended",
  "deliberately_broken",
  "cancelled",
]);
export const corpusStatus = pgEnum("corpus_status", [
  "building",
  "ready",
  "superseded",
  "expired",
  "failed",
]);
export const replayStatus = pgEnum("replay_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const deltaStability = pgEnum("delta_stability", [
  "pending",
  "stable",
  "flaky",
  "quarantined",
]);
export const gateOutcome = pgEnum("gate_outcome", [
  "pass",
  "note",
  "warn",
  "block",
  "error",
  "cancelled",
]);
export const integrationStatus = pgEnum("integration_status", [
  "pending",
  "active",
  "degraded",
  "revoked",
]);
export const notificationStatus = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
  "suppressed",
  "cancelled",
]);
export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
  "cancelled",
]);
export const llmRunStatus = pgEnum("llm_run_status", [
  "queued",
  "running",
  "succeeded",
  "rejected",
  "failed",
  "cancelled",
]);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export const platformOperatorStatus = pgEnum("platform_operator_status", ["active", "suspended"]);
export const keyPurpose = pgEnum("key_purpose", [
  "consumer_identity_hmac",
  "structural_hmac",
  "integration_encryption",
  "object_encryption",
]);
export const keyVersionStatus = pgEnum("key_version_status", [
  "pending",
  "active",
  "retiring",
  "retired",
  "revoked",
]);
export const configurationStatus = pgEnum("configuration_status", [
  "draft",
  "active",
  "superseded",
  "invalid",
]);
export const allowedOperationMode = pgEnum("allowed_operation_mode", [
  "read_only",
  "explicit_writes",
]);
export const adapterType = pgEnum("adapter_type", [
  "ndjson",
  "http_proxy",
  "kong",
  "envoy_als",
  "log_tap",
]);
export const ingestionStatus = pgEnum("ingestion_status", [
  "received",
  "validated",
  "processing",
  "processed",
  "partially_rejected",
  "failed",
]);
export const consumerAliasSource = pgEnum("consumer_alias_source", [
  "generated",
  "customer",
  "integration",
]);
export const consumerIdentitySource = pgEnum("consumer_identity_source", [
  "api_key",
  "client_id",
  "configured_header",
]);
export const sessionCompleteness = pgEnum("session_completeness", [
  "complete",
  "partial_start",
  "partial_end",
  "gapped",
]);
export const apiSpecSource = pgEnum("api_spec_source", ["upload", "github", "generated_draft"]);
export const validationStatus = pgEnum("validation_status", [
  "pending",
  "valid",
  "invalid",
  "failed",
]);
export const behaviorLabelSource = pgEnum("behavior_label_source", [
  "deterministic",
  "model",
  "human",
]);
export const reviewableStatus = pgEnum("reviewable_status", [
  "proposed",
  "active",
  "rejected",
  "superseded",
]);
export const behaviorClusterSource = pgEnum("behavior_cluster_source", ["model", "human"]);
export const clusterMembershipSource = pgEnum("cluster_membership_source", ["model", "human"]);
export const receiptType = pgEnum("receipt_type", [
  "t1_echo",
  "t2_pattern",
  "exposure",
  "replay_delta",
  "assertion",
]);
export const claimProposer = pgEnum("claim_proposer", ["rules", "model", "human"]);
export const evidenceRole = pgEnum("evidence_role", ["primary", "supporting", "counterexample"]);
export const assertionScope = pgEnum("assertion_scope", ["all_consumers", "selected_consumers"]);
export const assertionEventType = pgEnum("assertion_event_type", [
  "pinned",
  "extended",
  "documented",
  "break_scheduled",
  "reassigned",
  "expired",
  "cancelled",
  "resolved",
]);
export const actorType = pgEnum("actor_type", [
  "user",
  "agent",
  "ci_runner",
  "platform_operator",
  "system",
]);
export const breakingChangePlanStatus = pgEnum("breaking_change_plan_status", [
  "draft",
  "scheduled",
  "communication_ready",
  "completed",
  "cancelled",
]);
export const communicationStatus = pgEnum("communication_status", [
  "pending",
  "drafted",
  "reviewed",
  "exported",
  "acknowledged",
  "excluded",
]);
export const draftType = pgEnum("draft_type", [
  "impact_explanation",
  "spec_patch",
  "customer_notice",
]);
export const draftStatus = pgEnum("draft_status", ["draft", "accepted", "rejected", "published"]);
export const coverageClass = pgEnum("coverage_class", [
  "shape",
  "ordering",
  "error_template",
  "assertion",
  "negative_control",
]);
export const replayTriggerType = pgEnum("replay_trigger_type", [
  "manual",
  "pull_request",
  "assertion",
  "evaluation",
  "demo",
]);
export const gatePolicyVersionStatus = pgEnum("gate_policy_version_status", [
  "draft",
  "active",
  "superseded",
  "retired",
]);
export const gateExceptionStatus = pgEnum("gate_exception_status", [
  "pending",
  "approved",
  "used",
  "revoked",
  "expired",
]);
export const notificationChannel = pgEnum("notification_channel", ["in_app", "slack"]);
export const notificationSeverity = pgEnum("notification_severity", [
  "info",
  "warning",
  "critical",
]);
export const promptStatus = pgEnum("prompt_status", ["draft", "evaluated", "active", "retired"]);
export const validationResult = pgEnum("validation_result", [
  "pending",
  "passed",
  "failed",
  "not_applicable",
]);
export const evaluationScope = pgEnum("evaluation_scope", ["global", "organization"]);
export const evaluationStatus = pgEnum("evaluation_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const evaluationMetricName = pgEnum("evaluation_metric_name", [
  "precision",
  "recall",
  "f1",
  "true_positive",
  "false_positive",
  "false_negative",
  "replay_stability",
  "break_detection_rate",
  "assertion_resolution_rate",
  "assertion_auto_extension_rate",
  "time_to_ledger_seconds",
  "citation_validity",
  "abstention_rate",
]);
export const dataSubjectRequestType = pgEnum("data_subject_request_type", [
  "export",
  "delete_organization",
  "delete_user",
]);
export const requestStatus = pgEnum("request_status", [
  "pending",
  "verified",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export const auditOutcome = pgEnum("audit_outcome", ["succeeded", "denied", "failed"]);
