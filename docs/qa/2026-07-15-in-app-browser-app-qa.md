# In-app browser QA: 2026-07-15

## Result

Automated release checks passed. Live WorkOS browser coverage remained pending because Google
account selection required user input.

## Passed

- Sign-in and sign-out redirects for `http://localhost:3001`.
- Live data paths fail closed and do not render fixtures.
- Four Chromium tests covering the public page, workspace flow, validation, and 390 × 844 reload.
- Signed acceptance: 50,000 evaluated events, tenant-scoped ingestion, ledger population, three
  stable replay cases, Ed25519 verification, T1 block, T2 warning, and idempotent retry.
- Focused coverage for WorkOS provisioning, RLS, outbox delivery, receipt expiry, OpenAPI 3.1, CSP,
  membership freshness, integration destinations, and bounded SSE polling.
- `pnpm verify`, production bundle checks, entrypoint smokes, live migrations, RLS tests, and the
  OpenAI structured-output smoke.

## Not completed

- Authenticated WorkOS views at 390 × 844, 768 × 1024, 1280 × 720, and 1440 × 900.
- Live keyboard, overflow, sign-out/re-sign-in, SSE, and secret-leak checks on the intended tenant.
- Real GitHub Check Run and Slack delivery; provider credentials were unavailable.
- `pnpm audit`; the npm audit endpoints returned HTTP 410. `govulncheck` found no Go
  vulnerabilities.
