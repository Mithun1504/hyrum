# Development

## Requirements

- Node.js 22 LTS
- pnpm 10.33.0 through Corepack
- Go 1.24+
- Docker Compose v2
- WorkOS AuthKit for authenticated pages

OpenAI, GitHub, Slack, R2, Sentry, and OTLP credentials are optional for local development.

## Setup

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres minio minio-init wiremock
pnpm db:migrate
pnpm dev
```

The root `.env.local` is loaded by `pnpm dev` and database commands. Keep real credentials in an
approved secret manager. Commit only `.env.example`.

## Services

| Service       | Address                      |
| ------------- | ---------------------------- |
| Web           | <http://localhost:3000>      |
| Control plane | <http://localhost:4000>      |
| OpenAPI       | <http://localhost:4000/docs> |
| MinIO API     | <http://localhost:9000>      |
| MinIO console | <http://localhost:9001>      |

## WorkOS AuthKit

Create an AuthKit application with:

- Redirect URI: `http://localhost:3000/auth/callback`
- Sign-in endpoint: `http://localhost:3000/sign-in`
- Homepage: `http://localhost:3000`

Set `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, and
`NEXT_PUBLIC_WORKOS_REDIRECT_URI`. The cookie password must contain at least 32 random characters.

`/app` is protected by `apps/web/src/proxy.ts` and its server layout. The control plane verifies the
WorkOS token signature, issuer, and `client_id`; Hyrum remains responsible for roles and tenant
authorization.

## Database and jobs

The Drizzle schema is in `packages/db/src`. Generated SQL lives in `packages/db/migrations`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Production workers use `WORKER_DATABASE_URL` with the migration-managed `hyrum_worker` role. The
control plane and worker must not share credentials. Jobs use Postgres row locking and a
transactional outbox; Redis is not part of the architecture.

Tenant tables force row-level security. Application authorization is still required.

## Object storage

`@hyrum/storage` stores redacted receipt bundles and OpenAPI documents through the S3 API. Local
development uses MinIO; hosted environments use R2 or another compatible service. Keys are
tenant-prefixed content digests and never contain caller-controlled paths.

If object storage is unavailable, receipt metadata and its small redacted excerpt remain readable.
The UI must report that the durable bundle is unavailable.

## API rules

- Public routes live under `/v1`.
- Zod schemas define requests, responses, and OpenAPI 3.1 output.
- Errors use RFC 9457 problem details.
- Machine ingestion uses scoped Hyrum credentials.
- Webhooks verify the raw body before parsing.
- Logs exclude bodies, cookies, authorization headers, signed URLs, and prompts.

Agent tokens use Argon2id hashes with a lookup prefix. Legacy `sha256:` hashes are upgraded after a
successful authentication and should be rotated if they never authenticate.

## Frontend

Shared primitives live in `apps/web/src/components/ui`; product components live beside their
feature. Use semantic tokens from `apps/web/src/app/globals.css`. Do not add hard-coded product
colors or a second radius system.

```bash
cd apps/web
pnpm exec shadcn add <component>
```

## Verification

```bash
pnpm verify
pnpm exec playwright install chromium
pnpm test:e2e
pnpm demo:acceptance
```

Use `pnpm test:resilience` with the Compose `resilience` profile for database failure and recovery.
Run load tests only against an isolated, seeded environment.

External WorkOS, OpenAI, GitHub, and Slack calls require sandbox credentials. The regular test suite
uses mocked provider boundaries; local acceptance exercises machine auth, tenant scoping, capture,
storage, replay, and the gate without contacting those providers.
