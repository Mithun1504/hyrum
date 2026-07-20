# Release QA: 2026-07-15

## Result

The local release gate passed for deterministic capture, tenant isolation, replay, signed gate
decisions, the web review flow, and production builds.

## Verification

| Check                                            | Result                       |
| ------------------------------------------------ | ---------------------------- |
| `pnpm install --frozen-lockfile` on Node 22.18.0 | Passed                       |
| `pnpm verify`                                    | Passed                       |
| `pnpm test:e2e`                                  | Passed, three Chromium tests |
| Fresh Postgres 16 migration                      | Passed, seven migrations     |
| Live RLS and invariant suite                     | Passed, six tests            |
| `pnpm demo:acceptance`                           | Passed                       |
| `govulncheck ./...`                              | Passed, no findings          |
| `git diff --check`                               | Passed                       |

`pnpm audit` could not query the retired npm audit endpoints; this was not treated as a clean
dependency result.

## Acceptance evidence

- Evaluated 50,000 events twice with identical output.
- T1: 10,000 true positives, no false positives or false negatives.
- T2: 5,000 true positives, no false positives or false negatives.
- Ingestion accepted 40 representative events and produced one T1 claim, two T2 claims, and 19 T3
  exposure records.
- Three replay cases were stable. The verified decision blocked on T1 and warned on T2.
- Retrying the signed report was idempotent.
- Active assertions required exact signed coverage; missing or failed coverage blocked.

The machine-readable artifact was written to `tmp/demo-acceptance-report.json`.

## Security checks

- Redaction before egress, including dynamic keys, paths, headers, queries, and embedded credentials.
- Replay target allowlists, DNS rechecks, private-network denial, disabled redirects, and no proxy or
  cookie forwarding.
- Restricted proxy trust, production database TLS verification, tenant-prefixed object keys, bounded
  presigning, Ed25519 report verification, and server-side decision recomputation.

## Not live-tested

WorkOS human login, OpenAI advisory output, GitHub checks, and Slack delivery required external
credentials. Their schemas and fail-closed tests passed; this run did not contact the providers.
