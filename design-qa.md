# Design QA

**Result:** passed. No open P0, P1, or P2 findings.

## Coverage

- Desktop: 1280 × 720 and 1440 × 900.
- Mobile: 390 × 844 and 390 × 973.
- Views: capture, ledger, behavior detail, change gate, assertions, replay, and policy.
- States: loading, empty, degraded, permission-limited, filtered, drawer open/closed, and reload.

## Verified

- Evidence appears before summaries or model prose.
- T1 may block, T2 warns, and T3 is exposure only.
- Production reads tenant-scoped control-plane data and never falls back to fixtures.
- Mobile views have no horizontal overflow; evidence strings wrap or scroll within their region.
- The closed mobile drawer is unmounted and cannot cover the workspace after reload.
- Keyboard focus and controls remain visible and usable.

## Regression coverage

`apps/web/tests/e2e/workspace.spec.ts` covers desktop navigation, the 390 × 844 reload regression,
ledger filtering, receipt detail, gate semantics, assertion actions, and OpenAPI draft validation.

## Open item

Replay precision and recall are not shown until the control-plane read contract exposes them.
