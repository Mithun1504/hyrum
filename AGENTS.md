# Hyrum repository guidance

Before changing code, read `docs/PRD.md` and the approved `docs/TECH_STACK.md`. Do not edit either
document unless the user explicitly requests it.

## Boundaries

- Deterministic extractors and differential replay own behavior-change facts and gate decisions.
- GPT-5.6 may label, rank, explain, or draft; its output is advisory and schema-validated.
- T1 echo evidence may block. T2 warns. T3 is exposure only and never blocks.
- Redact at capture before egress. Never log bodies, secrets, cookies, credentials, signed URLs, or
  full prompts.
- Capture and replay import the same Go extractor package.
- Keep services tenant-scoped and pass `organization_id` explicitly through every data boundary.
- The approved job foundation is Postgres plus transactional outbox; do not add Redis.

## Verification

Run `pnpm verify` for TypeScript changes. Run `go test ./...` and `go vet ./...` for Go changes. Run
`pnpm test:e2e` when a browser flow changes. Generate and commit Drizzle migrations for schema changes.

Use Node 22 LTS, pnpm 10.33.0, Go 1.24+, Next.js App Router, Fastify, Drizzle, WorkOS AuthKit, and
theme-backed shadcn/ui primitives as specified by the approved stack.
