# Hyrum release QA — 2026-07-15

## Result

Passed the local release gate for deterministic capture, tenant-scoped control-plane behavior,
differential replay, signed gate decisions, the web review flow, and production builds.

## Automated verification

| Check                                                   | Result                                                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` on Node 22.18.0        | Passed                                                                                                                                                                           |
| `pnpm verify`                                           | Passed: format, lint, typecheck, package tests, demo tests, deterministic evaluation, signed replay, migration check, production builds, Go tests/vet/build                      |
| `pnpm test:e2e`                                         | Passed: 3 Chromium tests, including desktop navigation and mobile reload/navigation                                                                                              |
| Fresh Postgres 16 migration                             | Passed through all seven committed migrations                                                                                                                                    |
| Live RLS/invariant suite                                | Passed: 6 tests; forged worker setting denied, tenant isolation enforced, only the dedicated non-bypass worker role sees the global queue, invalid assertion references rejected |
| `pnpm demo:acceptance`                                  | Passed                                                                                                                                                                           |
| `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` | Passed: no vulnerabilities found                                                                                                                                                 |
| `git diff --check`                                      | Passed                                                                                                                                                                           |

The dependency-audit command could not return findings: npm retired both endpoints used by
`pnpm audit --prod --audit-level high`, and both returned HTTP 410. This is an audit-service/tooling
limitation, not a clean dependency finding.

## Acceptance evidence

- Evaluated 50,000 capture events twice with identical output.
- T1: 10,000 true positives, zero false positives or false negatives.
- T2: 5,000 true positives, zero false positives or false negatives.
- Hard-negative violations: zero.
- Authenticated ingestion accepted 40 representative events and rejected zero.
- Ledger produced one T1 claim, two T2 claims, and nineteen T3 exposure records.
- Legacy machine-token authentication rotated the stored hash to Argon2id.
- Three replay cases were stable, none were quarantined, and the signed control-plane-verified
  decision blocked on T1 while warning on T2.
- Retrying the identical signed replay reused the same run and left exactly one set of deltas,
  assertion results, gate decision, and progress event.
- Active compatibility assertions require exact signed per-assertion coverage; failed or missing
  coverage blocks.

The machine-readable acceptance artifact is written to `tmp/demo-acceptance-report.json`.

## Browser and design QA

- Matched the supplied Hyrum desktop and mobile mock references through `.impeccable.md`.
- Checked the capture, behavior, assertion, and gate views at 1280 x 720 and 390 x 844.
- Confirmed no horizontal overflow at either viewport.
- Confirmed evidence and replay links navigate to their intended surfaces.
- Confirmed capture-configuration controls are explicitly disabled with accessible explanations,
  rather than appearing interactive and doing nothing.
- Side-by-side source and implementation evidence is recorded in `design-qa.md`; the final visual
  comparison passed.

## Security review

- Redaction happens before egress and covers bodies, dynamic keys, paths, headers, queries, signed
  values, and embedded credentials without logging raw traffic.
- Replay targets use explicit allowlists, private/link-local/metadata denial, DNS rechecks, and
  disabled redirects, proxies, and cookies.
- JWKS resolution is cached; proxy trust is restricted to configured CIDRs.
- Production database TLS is required and uses full certificate verification.
- Object storage enforces tenant-prefixed content-addressed keys, size/digest validation, and bounded
  presigning.
- Replay reports require Ed25519 signatures and immutable base/candidate image digests; the server
  recomputes the decision.

## Not live-tested

WorkOS human login, OpenAI advisory output, GitHub checks, and Slack delivery require external
credentials and were not contacted. Their schemas, fail-closed boundaries, and package tests passed;
machine authentication, tenant scoping, deterministic capture/replay, storage, and the gate were
exercised live locally.
