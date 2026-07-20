# Hyrum

Find accidental API contracts and test changes before they reach consumers.

**Live app:** [hyrum.vercel.app](https://hyrum.vercel.app/)

[![CI](https://github.com/Mithun1504/hyrum/actions/workflows/ci.yml/badge.svg)](https://github.com/Mithun1504/hyrum/actions/workflows/ci.yml)
![Node 22](https://img.shields.io/badge/Node-22-339933?logo=nodedotjs&logoColor=white)
![Go 1.24+](https://img.shields.io/badge/Go-1.24%2B-00ADD8?logo=go&logoColor=white)

Hyrum captures redacted, session-correlated API traffic, records undeclared behavior by consumer,
and replays candidate builds against the same corpus. A change may block only when deterministic
replay matches T1 echo evidence. T2 warns. T3 records exposure and never blocks.

```mermaid
flowchart LR
  A["Capture and redact"] --> B["Evidence ledger"]
  C["Base and candidate images"] --> D["Differential replay"]
  B --> E["Policy decision"]
  D --> E
```

## Quick start

Requirements: Node.js 22, pnpm 10.33.0, Go 1.24+, and Docker Compose v2.

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres minio minio-init
DATABASE_URL=postgresql://hyrum:hyrum@127.0.0.1:5432/hyrum pnpm db:migrate
pnpm dev
```

- Web: <http://localhost:3000>
- Control plane: <http://localhost:4000>
- OpenAPI: <http://localhost:4000/docs>
- MinIO: <http://localhost:9001>

Authenticated pages require a WorkOS AuthKit application. See
[Development](docs/DEVELOPMENT.md#workos-authkit).

## Run the complete demo

```bash
pnpm demo:acceptance
```

The acceptance run processes 50,000 scripted events, ingests them through the control plane,
builds the ledger, runs signed differential replay, and verifies the gate decision. It writes the
result to `tmp/demo-acceptance-report.json` and removes temporary services on exit.

## Trust model

- Capture redacts bodies, secrets, credentials, cookies, and signed values before egress.
- Capture and replay import the same versioned Go extractors.
- T1 requires a response-only value to appear in a later request from the same complete session.
- T2 is suggestive pattern evidence. T3 is exposure only.
- GPT-5.6 may label, rank, explain, or draft. It cannot set evidence or gate decisions.
- Every tenant-owned boundary carries `organization_id`; Postgres RLS adds containment.
- Replay reports require immutable image digests and an Ed25519 signature. The server recomputes
  the decision.

## Built with Codex and OpenAI

- **Codex** was the engineering agent used to trace the repository, implement product flows,
  refactor the workspace, write and repair tests, and run the release checks.
- **GPT-5.6-sol** supplied the coding and reasoning model for that Codex work. It helped turn the
  PRD and approved architecture into reviewed code, but it is not part of Hyrum's runtime decision
  path.
- **Hyrum's OpenAI integration** uses the official SDK, Responses API, GPT-5.6, and Structured
  Outputs. It receives redacted evidence to cluster and name behaviors, propose evidence tiers,
  prioritize replay cases, explain consumer impact, draft OpenAPI changes, and draft customer
  notices. Hyrum validates every response against a Zod schema and supplied receipt IDs, records
  the model and token usage, and keeps `store: false`.

Deterministic Go extractors and differential replay remain authoritative. Model output cannot
create behavior facts, promote unsupported evidence to T1, change replay results, or decide whether
a gate blocks.

## Repository

| Path                  | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `apps/web`            | Next.js review workspace                                           |
| `apps/control-plane`  | Fastify API, webhooks, and progress stream                         |
| `apps/worker`         | Postgres jobs and transactional outbox                             |
| `cmd/hyrum-agent`     | Go capture and redaction agent                                     |
| `cmd/hyrum-replay`    | Go differential replay runner                                      |
| `internal`            | Shared deterministic Go logic                                      |
| `packages`            | Contracts, database, storage, integrations, OpenAI, and API client |
| `demo` and `fixtures` | Reproducible product demo                                          |

## Verify

```bash
pnpm verify
pnpm test:e2e
pnpm demo:acceptance
```

`pnpm verify` covers formatting, lint, TypeScript, tests, migrations, generated OpenAPI, production
builds, Go tests, vet, and binaries. Browser and full acceptance checks run separately because they
start Chromium and Docker services.

## Documentation

- [Product requirements](docs/PRD.md)
- [Technology and architecture](docs/TECH_STACK.md)
- [Development](docs/DEVELOPMENT.md)
- [Remaining work](docs/PENDING.md)
- [Contributing](CONTRIBUTING.md)

## License

No open-source license has been granted. Copyright remains with the repository owner.
