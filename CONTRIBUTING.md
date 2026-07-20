# Contributing

Create a short-lived branch from `main` and keep the pull request focused. Read
[`docs/PRD.md`](docs/PRD.md), [`docs/TECH_STACK.md`](docs/TECH_STACK.md), and the closest
`AGENTS.md` before changing code.

## Requirements

- Keep deterministic extraction and replay in control of behavior facts and gate decisions.
- Pass `organization_id` through every tenant-owned API, job, repository, and storage boundary.
- Validate untrusted input at the boundary. Do not log bodies, secrets, credentials, signed URLs,
  or full prompts.
- Commit generated Drizzle migrations for schema changes.
- Document new environment variables in `.env.example`.
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, or `chore:`.

## Before opening a pull request

```bash
pnpm verify
pnpm test:e2e # when a browser flow changes
pnpm demo:acceptance # when capture, replay, or gate behavior changes
git diff --check
```

The pull request should state why the change is needed, how it works, and which commands passed.
