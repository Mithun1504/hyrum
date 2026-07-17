# Hyrum in-app browser release QA — 2026-07-15

## Current result

All automated release paths pass. The final live WorkOS browser matrix is pending one user-owned
step: selecting the intended Google identity in the in-app browser.

## Passed

- WorkOS application redirect and sign-out redirect are configured for `http://localhost:3001`.
- Sign-out clears the Hyrum session and returns to the public product page.
- Live mode no longer renders fabricated API, environment, version, user, or integration state.
- Live API failures use bounded problem details instead of raw validation or database errors.
- Chromium E2E passes four tests covering the public page, capture, ledger filtering, receipt detail,
  T1/T2/T3 gate semantics, replay health, assertion pin validation, OpenAPI draft validation, and a
  390 x 844 mobile reload/navigation state.
- Applying ledger filters preserves `view=ledger`; this was found and fixed during the browser pass.
- The signed acceptance run passes capture to ledger to differential replay to gate:
  50,000 events evaluated twice, 40 authenticated events accepted, 22 active claims, three stable
  replay cases, a verified Ed25519 report, T1 block, T2 warn, and an idempotent retry.
- WorkOS just-in-time provisioning, tenant-scoped RLS, transactional outbox delivery, receipt expiry
  cleanup, OpenAPI 3.1, CSP, and bounded non-overlapping SSE polling have focused regression tests.
- Existing human sessions recheck active WorkOS organization membership through a bounded,
  deduplicated freshness cache; inactive or unverifiable memberships fail closed.
- GitHub and Slack delivery destinations resolve through active tenant-owned mappings at ingestion
  and are re-read by the worker before delivery. Queued events never trust raw external destinations.
- Ledger entries and their dependency claims automatically become stale after 90 days. The worker
  handles bounded batches and later same-day deadlines without losing the next scheduled downgrade.
- `pnpm verify` passes on Node 22 across formatting, lint, typechecking, package tests, deterministic
  demo tests, migration consistency, production builds, Go tests, vet, and binary builds. Post-build
  checks prove that control-plane and worker bundles contain no source-workspace imports; both
  production entrypoints were started successfully on Node 22.
- Live Postgres migration `0010` is applied, its two new integration tables have forced RLS, and the
  runtime RLS integration suite passes 4/4 tests.
- The repository-root `.env.local` is now loaded by the canonical `pnpm dev` and
  `pnpm db:migrate` commands.
- The live OpenAI structured-output smoke passed separately with citation containment and no prompt,
  body, token, or user content logged.

## Pending live browser checks

- Complete Google account selection and confirm the refreshed WorkOS token carries organization
  context.
- Exercise all six authenticated workspace routes at 390 x 844, 768 x 1024, 1280 x 720, and
  1440 x 900.
- Confirm keyboard focus, no horizontal overflow, clean sign-out/re-sign-in, SSE connection, and no
  visible secret or raw-body leakage on the live tenant.

## External limitations

- GitHub Check Run and Slack delivery use the official SDK paths and signed local fixtures, but no
  provider credentials are configured, so no real external message was sent.
- `pnpm audit` cannot return findings because both npm audit endpoints respond HTTP 410. Go's
  `govulncheck` reports no vulnerabilities.
