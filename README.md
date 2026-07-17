# Hyrum

Prevent accidental API breakage with traffic receipts and deterministic differential replay.

[![CI](https://github.com/Mithun1504/hyrum/actions/workflows/ci.yml/badge.svg)](https://github.com/Mithun1504/hyrum/actions/workflows/ci.yml)
![Node 22](https://img.shields.io/badge/Node-22-339933?logo=nodedotjs&logoColor=white)
![Go 1.24+](https://img.shields.io/badge/Go-1.24%2B-00ADD8?logo=go&logoColor=white)

Hyrum gives platform leads and SREs evidence for high-stakes API changes. It captures redacted,
session-correlated behavior, builds a per-consumer ledger of undocumented contracts, and blocks only
when stable replay proves that a change breaks T1 echo evidence.

```mermaid
flowchart LR
  A["Go capture agent"] -->|"redacted batches"| B["Control plane"]
  B --> C["Evidence ledger"]
  D["Base and candidate images"] --> E["Differential replay"]
  E -->|"signed report"| B
  C --> F["T1 block, T2 warn, T3 exposure"]
  B --> G["Review workspace"]
```

## Install

Prerequisites: Node.js 22 LTS, pnpm 10.33.0, Go 1.24+, and Docker Compose v2.

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres minio minio-init
DATABASE_URL=postgresql://hyrum:hyrum@127.0.0.1:5432/hyrum pnpm db:migrate
```

## Usage

Run the production-faithful acceptance path with its isolated default ports 4400, 55436, 19000,
and 19001 available. Override the database and object-storage ports with the
`HYRUM_ACCEPTANCE_*_PORT` variables when needed:

```bash
pnpm demo:acceptance
```

The command generates and evaluates 50,000 scripted consumer events, sends a representative
redacted slice through authenticated capture ingestion, populates the real ledger, replays base and
candidate Docker images, signs the report with Ed25519, and verifies the server-computed gate. Its
machine-readable result is written to `tmp/demo-acceptance-report.json`; temporary containers and
credentials are removed on exit.

For local product development:

```bash
docker compose up -d postgres minio minio-init
pnpm dev
```

- Web: <http://localhost:3000>
- Control plane and OpenAPI: <http://localhost:4000> and <http://localhost:4000/docs>
- MinIO console: <http://localhost:9001>

WorkOS credentials are required for real human sessions. The explicit non-production auth/data
bypass is reserved for automated browser tests and mock-matched local design QA; production never
falls back to fixtures.

## Features

- **Prove dependencies, not exposure:** T1 requires a response-only value to reappear in a later
  request from the same complete consumer session.
- **Keep inference out of the gate:** deterministic Go extractors and replay own behavior-change
  facts; GPT-5.6 can label, explain, rank, or draft only.
- **Review the receipt:** redacted evidence metadata survives object-store outages, while content is
  stored under tenant-prefixed, content-addressed S3/R2 keys.
- **Contain every tenant boundary:** organization context is explicit in APIs, jobs, storage keys,
  and forced Postgres row-level security policies.
- **Reject forged gate reports:** replay reports require immutable image digests, an Ed25519
  signature bound to the machine identity, active tenant claims, and a server-recomputed decision.
- **Make assertions expire:** pinned compatibility assertions require ownership, a reason, and an
  expiry; replay signs per-assertion pass/fail coverage, missing or failed active assertions block,
  and the worker marks due assertions expired while emitting progress events.

## API and binaries

The Fastify control plane exposes validated `/v1` endpoints for capture batches, ledger and receipt
reads, assertions, policies, OpenAPI uploads and drafts, replay reports, and progress SSE. OpenAPI
3.1 documentation is served from `/docs`.

```bash
go build ./cmd/hyrum-agent ./cmd/hyrum-replay
pnpm --filter @hyrum/control-plane build
pnpm --filter @hyrum/worker build
pnpm --filter @hyrum/web build
```

Repository details, environment variables, auth setup, and service conventions are in
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). Product and architecture decisions remain in
[`docs/PRD.md`](docs/PRD.md) and [`docs/TECH_STACK.md`](docs/TECH_STACK.md).

## Verification

```bash
pnpm verify
pnpm test:e2e
pnpm demo:acceptance
```

`pnpm verify` covers formatting, lint, strict TypeScript, unit and demo tests, deterministic
evaluation/replay, Drizzle migration checks, production builds, Go tests/vet, and both Go binaries.
Browser tests are separate because they install and launch Chromium.

## Contributing

Read [`AGENTS.md`](AGENTS.md), the approved PRD, and the approved stack before changing code. Keep
business rules canonical, pass `organization_id` across every data boundary, generate Drizzle SQL
for schema changes, and add evidence proportional to the risk.

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm test:e2e
git diff --check
```

## License

No open-source license has been granted. Copyright remains with the repository owner.
