INSERT INTO scheduled_tasks (
  organization_id,
  api_service_id,
  task_type,
  schedule_expression,
  timezone,
  next_run_at,
  idempotency_seed
) VALUES (
  NULL,
  NULL,
  'purge_deleting_organizations',
  '1 minute',
  'UTC',
  now(),
  'privacy-purge:platform'
)
ON CONFLICT DO NOTHING;
