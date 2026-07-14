# Contributing

Use short-lived branches from `main` and keep pull requests focused. Before coding, read
`docs/PRD.md`, `docs/TECH_STACK.md`, and the closest `AGENTS.md`.

## Pull request checklist

- The change stays within the approved architecture and does not weaken deterministic gate ownership.
- New tenant data is organization-scoped and authorization is tested.
- New environment variables are documented in `.env.example`.
- Schema changes include generated forward-compatible migrations.
- Logs and test fixtures contain no raw secrets or customer traffic.
- `pnpm verify`, `go test ./...`, and relevant browser/integration tests pass.
- User-visible states include accessible loading, empty, error, and success treatment where relevant.

Use conventional commits where practical: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, and `refactor:`.
