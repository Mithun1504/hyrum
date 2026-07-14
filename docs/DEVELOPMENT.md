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
cp .env.example .env
docker compose up -d postgres minio minio-init wiremock
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Use 1Password CLI or the team's approved secret manager for real credentials. `.env` and all local
variants are ignored; `.env.example` is the only environment file committed to source control.

## WorkOS AuthKit

Create an AuthKit application and configure:

- Redirect URI: `http://localhost:3000/auth/callback`
- Sign-in endpoint: `http://localhost:3000/sign-in`
- Homepage URL: `http://localhost:3000`

Set `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, and
`NEXT_PUBLIC_WORKOS_REDIRECT_URI`. The cookie password must contain at least 32 random characters.
The `/app` route is secure by default through `apps/web/src/proxy.ts` and validates the session again
inside its Server Component layout.

The control-plane bearer-token verifier is deny-by-default. Configure its JWKS URL, issuer, and
audience before using protected `/v1` endpoints. Product authorization remains in Hyrum's database;
WorkOS supplies identity and organization context only.

## Database and jobs

Drizzle schema source is `packages/db/src/schema.ts`; generated SQL migrations are committed under
`packages/db/migrations`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

The worker uses a durable Postgres table and `FOR UPDATE SKIP LOCKED`. Job handlers are deliberately
empty in the scaffold. New handlers must be idempotent, tenant-scoped, bounded, and registered by
explicit job type. Redis is not part of the approved architecture.

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

## Verification

Run the full handoff gate before opening a pull request:

```bash
pnpm verify
```

Playwright is separate because it starts a browser and web server:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The public smoke flow is browser → Next.js page → themed component rendering. The service smoke flow
is HTTP → Fastify validation/error handling → health response; `/ready` adds a real Postgres boundary.
Authenticated and database flows require their corresponding local services and credentials.

## Adding a feature

1. Re-read the relevant PRD and technology-stack sections.
2. Add or update shared Zod contracts first.
3. Keep tenant context explicit at API, service, repository, and object-storage boundaries.
4. Add unit, integration, browser, deterministic golden, or model eval coverage proportional to risk.
5. Keep OpenAI calls behind schema validation and deterministic eligibility checks.
6. Update docs and `.env.example` when setup changes.
