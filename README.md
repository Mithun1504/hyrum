# Hyrum

Hyrum is the evidence-backed ledger of an API's accidental contracts. It captures privacy-safe API
behavior, builds a per-consumer dependency ledger, differentially replays candidate builds, and
publishes deterministic compatibility gates.

The product requirements live in [`docs/PRD.md`](docs/PRD.md). The approved architecture and
technology decisions live in [`docs/TECH_STACK.md`](docs/TECH_STACK.md) and must be reviewed before
changing architecture or infrastructure.

## Quick start

Prerequisites: Node.js 24 LTS, pnpm 10.33.0 through Corepack, Go 1.26.x, and Docker with Compose v2.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres minio minio-init wiremock
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web: <http://localhost:3000>
- Control plane: <http://localhost:4000>
- OpenAPI UI: <http://localhost:4000/docs>
- MinIO console: <http://localhost:9001>
- WireMock: <http://localhost:8080>

WorkOS credentials are only required to enter `/app`; the public landing page and liveness endpoints
remain usable without them. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for full setup and
verification instructions.

## Repository map

```text
apps/web                 Next.js 16 web application
apps/control-plane       Fastify REST API and OpenAPI document
apps/worker              Postgres-backed job runner
apps/demo                Eight-endpoint base/candidate API and scripted consumers
packages/api-client      Reusable validated control-plane client
packages/contracts       Shared Zod API and authorization contracts
packages/db              Drizzle schema, migrations, database and job primitives
packages/env             Environment validation
packages/evals           Committed release corpus and precision/recall evaluator
packages/integrations    GitHub and Slack integration contracts
packages/logger          Redacting structured logger
packages/openai          OpenAI client and advisory-output boundary
cmd/hyrum-agent          Customer-side Go process entry point
cmd/hyrum-replay         CI-side Go replay entry point
internal                 Shared Go packages
infra                    Local services and production container definitions
```

## Core commands

```bash
pnpm dev          # start web, API, and worker in watch mode
pnpm test         # TypeScript unit/component tests
pnpm test:e2e     # Playwright browser test
pnpm eval:release # deterministic labeled-corpus evaluation
pnpm demo:capture # generate the scripted 50k-request capture fixture
pnpm lint         # ESLint and Biome checks
pnpm typecheck    # strict TypeScript checks
pnpm build        # production builds
pnpm verify       # complete TypeScript and Go handoff gate
go test ./...     # focused Go unit tests
```

## Architectural guardrails

- Deterministic code measures behavior and owns gate decisions. OpenAI output is advisory only.
- Raw traffic and secrets must be redacted before leaving the customer trust boundary.
- T1 requires echo evidence; T2 warns; T3 records exposure and never blocks.
- Capture and replay must share the same versioned extractor implementation.
- Do not add Redis, Kafka, vector search, Kubernetes, or Temporal without measured need and an
  approved architecture update.
