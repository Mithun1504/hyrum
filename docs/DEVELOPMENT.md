# Development Guide

## Prerequisites

- Node.js 24 LTS (`.nvmrc` and `.tool-versions` are provided)
- Corepack and pnpm 10.33.0
- Go 1.26.x
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

The worker uses a durable Postgres queue with leased, fenced claims. Implemented handlers cover
capture processing, corpus construction, assertion lifecycle, differential replay follow-up, GitHub
Checks, notifications, Slack delivery, schema-validated advisory generation, privacy exports, and
two-phase organization deletion. New handlers must be idempotent, tenant-scoped unless explicitly
platform-scoped, bounded, and registered by explicit job type. Redis is not part of the approved
architecture.

## Reproducible hackathon demo

The demo is an eight-endpoint e-commerce API with base and candidate variants. Consumers A, B, and C
are explicitly scripted; the capture, redaction, extraction, ledger, replay, and gate path is real.

```bash
docker compose --profile demo up -d demo-base demo-candidate
pnpm demo:capture
```

`pnpm demo:capture` sends 50,000 requests by default and writes the raw local capture envelope under
the ignored `.hyrum-demo` directory. Set `DEMO_REQUESTS=100` for a smoke run or `DEMO_BASE_URL` to
target another base instance. Feed that file to `hyrum-agent` with sampling set to `1` for a fully
deterministic demo fixture. Consumer A echoes `next_cursor` (T1), consumer B retries on one controlled
422 template (T2), and consumer C only observes `legacy_id` (T3).

## Release evaluation

The committed labeled corpus contains planted T1/T2/T3 cases and hard negatives. Run it with:

```bash
pnpm eval:release
```

The command exits non-zero when the T1 precision gate fails and always reports precision and recall
together. When `DATABASE_URL` is present, it also records the immutable global dataset, evaluation
run, and all per-tier confusion metrics using the release/evaluation database role.

## GitHub pull-request replay

Install the GitHub App, connect the repository to a Hyrum service, and set
`GITHUB_ACTIONS_OIDC_AUDIENCE` to the same value passed to the action. The workflow needs no stored
Hyrum credential: GitHub OIDC is exchanged for a 15-minute, one-use runner bundle.

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - uses: actions/checkout@v4
  - uses: ./.github/actions/hyrum-replay
    with:
      control-plane-url: https://hyrum.example.com
      service-slug: payments
      corpus-id: ${{ vars.HYRUM_CORPUS_ID }}
      base-image: sha256:<immutable-base-digest>
      candidate-image: sha256:<immutable-candidate-digest>
      replay-image: ghcr.io/example/hyrum-go-tools@sha256:<pinned-digest>
```

The job must run on Linux with Docker, OpenSSL, curl, and jq. Pin all third-party actions and the Hyrum
runner image by commit or digest in production. Pull-request events from unconnected repositories,
fork mismatches, expired corpora, and non-PR OIDC subjects are rejected.

## Advisory drafts

`OPENAI_API_KEY` enables cited replay explanations, additive OpenAPI patch drafts, and customer notice
drafts. Model output is persisted as a generated artifact, marked AI-assisted, and requires explicit
human acceptance. Invalid citations, destructive JSON Patch operations, and notices containing
untrusted links are rejected; an OpenAI outage produces an abstaining deterministic fallback and does
not affect extraction, replay, or gate decisions.

## Privacy workflows

Workspace owners can request an allowlisted JSON export or permanent deletion under
`/app/settings/privacy`; both actions require recent authentication and exact confirmation text.
Exports exclude traffic bodies, credentials, secrets, HMAC inputs, prompts, and signed URLs and expire
after seven days. Deletion first records a manifest and moves the workspace to `deleting`; the
platform maintenance job deletes every tenant object before cascading relational records. Only a
secret-free digest and aggregate counts remain in the platform audit trail.

## Internal support access

Internal routes are absent unless `INTERNAL_OPERATIONS_ENABLED=true`; enable them only on a private
operations deployment or network path. Platform operators are provisioned directly with explicit
capabilities. One operator requests a 5–60 minute read-only grant and a different operator must
approve it. The requesting operator then sends the grant UUID in `X-Hyrum-Support-Grant` with their
normal WorkOS bearer token. Expired, revoked, unapproved, self-approved, write-scoped, or
cross-operator grants are denied. Receipt access is recorded in the tenant audit trail as a platform
operator action citing the support grant.

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
