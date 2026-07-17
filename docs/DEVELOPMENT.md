# Development Guide

## Prerequisites

- Node.js 22 LTS (`.nvmrc` and `.tool-versions` are provided)
- Corepack and pnpm 10.33.0
- Go 1.24 or newer
- Docker Desktop or Docker Engine with Compose v2
- A WorkOS AuthKit application for authenticated pages
- Optional OpenAI, GitHub App, Slack App, R2, Sentry, and OTLP credentials

## First-time setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
docker compose up -d postgres minio minio-init wiremock
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Use 1Password CLI or the team's approved secret manager for real credentials. The root
`.env.local` is loaded by `pnpm dev` and `pnpm db:migrate`; environment files are ignored and
`.env.example` is the only one committed to source control.

## WorkOS AuthKit

Create an AuthKit application and configure:

- Redirect URI: `http://localhost:3000/auth/callback`
- Sign-in endpoint: `http://localhost:3000/sign-in`
- Homepage URL: `http://localhost:3000`

Set `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, and
`NEXT_PUBLIC_WORKOS_REDIRECT_URI`. The cookie password must contain at least 32 random characters.
The `/app` route is secure by default through `apps/web/src/proxy.ts` and validates the session again
inside its Server Component layout.

The control-plane bearer-token verifier is deny-by-default. It verifies the WorkOS session-token
signature and issuer, then requires the token `client_id` claim to exactly match `WORKOS_CLIENT_ID`.
`WORKOS_JWKS_URL` is optional; by default the verifier uses WorkOS' client-scoped session JWKS URL.
Product authorization remains in Hyrum's database; WorkOS supplies identity and organization context
only.

## Database and jobs

Drizzle schema source is `packages/db/src/schema.ts`; generated SQL migrations are committed under
`packages/db/migrations`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

The worker uses a durable Postgres table and `FOR UPDATE SKIP LOCKED`. Current handlers expire due
assertions, downgrade stale ledger entries, delete expired receipt objects, and publish transactional
outbox records. Handlers must remain idempotent, tenant-scoped, bounded, and registered by explicit
job type. Redis is not part of the approved architecture.

Production workers must use `WORKER_DATABASE_URL` with a dedicated non-superuser login that is a
member of the migration-managed `hyrum_worker` role. The control plane and worker must not share
credentials. The worker role can claim jobs and outbox records across organizations, while handler
work still runs inside an explicit tenant transaction. Local development falls back to
`DATABASE_URL` when `WORKER_DATABASE_URL` is unset.

Postgres row-level security is forced on tenant tables. Request and worker transactions set only the
narrow, transaction-local identity needed by their policy. Application authorization remains
mandatory; RLS is containment if an application query misses its tenant predicate.

## Object storage

Redacted receipt bundles and uploaded OpenAPI documents use the S3-compatible `@hyrum/storage`
package. Local development targets MinIO; hosted deployments target R2 or another compatible store.
Keys are generated as tenant-prefixed content digests and cannot include caller-controlled path
segments.

The local defaults match `compose.yaml`: endpoint `http://127.0.0.1:9000`, bucket
`hyrum-development`, and path-style requests. Production configuration rejects the local endpoint,
bucket, and credentials. Receipt metadata and its small redacted excerpt remain available if object
storage is temporarily unavailable; `object_key` is null so the UI reports the missing durable
bundle instead of pretending it exists.

## UI and design system

shadcn/ui source lives in `apps/web/src/components/ui`. Product components live one level above it;
feature-local components should live near their route or feature. Add primitives from the web app:

```bash
cd apps/web
pnpm exec shadcn add <component>
```

All foundational colors, fonts, spacing, radii, evidence tiers, and status values are CSS variables
in `apps/web/src/app/globals.css`. Components must use semantic utilities such as `bg-background`,
`text-muted-foreground`, `border-border`, and `text-tier-proof`; do not introduce hard-coded product
colors or independent radius systems.

## API conventions

- Public product routes are under `/v1`.
- Request and response schemas use Zod and appear in OpenAPI 3.1 documentation.
- Errors use `application/problem+json` and RFC 9457 fields.
- Machine ingestion will use scoped first-party credentials, never browser sessions.
- Webhook routes must verify the raw body before parsing.
- Logs must never include request/response bodies, cookies, auth headers, signed URLs, or prompts.

## Machine token rotation

Agent tokens are stored as Argon2id PHC hashes with a lookup prefix. Existing `sha256:` hashes are
accepted only as a transition path: after a successful machine-token authentication, the control
plane rewrites the row to Argon2id using the same token. Operators should rotate any agent token that
never authenticates during the transition window, then remove any remaining `sha256:` rows.

## Verification

Run the full handoff gate before opening a pull request:

```bash
pnpm verify
```

Playwright and the full operational demo are separate because they start browsers, containers, and
local services:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
pnpm demo:acceptance
```

The public smoke flow is browser → Next.js page → themed component rendering. The service smoke flow
is HTTP → Fastify validation/error handling → health response; `/ready` adds a real Postgres boundary.
The acceptance harness exercises machine authentication, tenant scoping, Argon2id token rotation,
MinIO, real capture ingestion, ledger population, signed replay ingestion, and the deterministic
gate, including signed coverage for active compatibility assertions. WorkOS, OpenAI, GitHub, and
Slack need external credentials and are deliberately not contacted by that local run; their
boundaries are covered by schema and package tests.

## Adding a feature

1. Re-read the relevant PRD and technology-stack sections.
2. Add or update shared Zod contracts first.
3. Keep tenant context explicit at API, service, repository, and object-storage boundaries.
4. Add unit, integration, browser, deterministic golden, or model eval coverage proportional to risk.
5. Keep OpenAI calls behind schema validation and deterministic eligibility checks.
6. Update docs and `.env.example` when setup changes.
