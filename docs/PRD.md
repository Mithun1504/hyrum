# Hyrum — PRD & Spec

**Track:** Developer tools
**One-liner:** The ledger of your API's accidental contracts. Hyrum watches
production traffic, finds the undocumented behaviors consumers actually depend
on (Hyrum's Law), and gates changes on them — with traffic receipts, before
the outage instead of after.

*Rev 2 — after external review (sol, 2026-07-14): the change gate is now a
differential replay harness, not an LLM/static-analysis oracle; capture
samples by consumer-session to preserve the sequences dependency inference
needs; timing behaviors cut; T1 tightened to echo-evidence; demo made
internally consistent; dependency recall added to metrics.*

## 1. Problem

Hyrum's Law (Hyrum Wright, Google): with enough users, every observable
behavior of your API will be depended on by somebody, regardless of what you
documented. Result ordering nobody promised but a customer's pagination
assumes. An error string a customer's regex parses. A field one client reads
as null and another expects absent.

None of this is in the OpenAPI spec, so nothing guards it. Contract-testing
tools (Pact) verify *declared* contracts. Spec-drift tools diff traffic
against the spec you wrote. Breaking-change detectors (oasdiff, Speakeasy)
diff spec versions. The contract you created *by accident* — the one that
causes the incident — has no tooling. Today the ledger of accidental
contracts is discovered one outage at a time.

## 2. Users & buyer

- **Primary — platform/API team lead** at a B2B company whose API is the
  product or a major surface (fintech, infra, SaaS with public API). Owns
  "don't break customers" and currently does it with folklore.
- **Secondary — API support/DX engineers** (blast-radius answers before
  deprecations), **SRE** (change-risk signal).
- ICP v1: companies with ≥ 50 external API consumers, a gateway they control
  (Kong, Envoy, or a log pipeline), and a containerizable API build (needed
  for replay, §4.4).

## 3. Goals / non-goals

**Goals**
- G1: Build a per-consumer ledger of observed, depended-on behaviors that the
  spec doesn't declare.
- G2: Gate proposed changes in CI via **differential replay**: prove which
  observable behaviors a candidate build changes, then report which consumers
  depend on them, with traffic evidence.
- G3: Every dependency claim carries receipts (sampled request/response
  sequences, redacted) and an evidence tier. Both precision *and recall* of
  dependency claims are measured — a ledger that stays safe by claiming
  nothing is a failed ledger.
- G4: Assertions expire by design — each accidental contract moves toward
  "documented" or "deliberately broken with notice," never silent permanence.

**Non-goals**
- Not an API gateway, not an observability platform, not error tracking.
- Does not block traffic or modify responses in v1 (observe + gate only).
- Not for internal-only microservice meshes in v1.
- No timing/latency behaviors in the ledger (see §4.1 — cut as noise).

## 4. How detection works (the core spec)

### 4.1 Behavior extraction (from sampled traffic)
Per endpoint × consumer (API key/client id), compute behavioral fingerprints:
- **Shape:** fields present/absent/null patterns, casing, types, enum values
  observed, undocumented fields returned.
- **Ordering:** stability of array ordering across paginated calls.
- **Errors:** status × error-body string templates (clustered), which
  consumers receive which.
- Deterministic extractors; LLM used only to cluster/name behaviors and
  draft human-readable descriptions.
- Explicitly excluded: response-time and retry-timing distributions. They
  are dominated by infrastructure and client libraries; without controlled
  variation they produce noise, not contracts.

### 4.2 Dependency inference (the hard part — tiered)
A consumer *receiving* a behavior ≠ *depending* on it. Evidence tiers:
- **T1 — echo evidence:** a value that exists only in the undocumented
  behavior reappears in the consumer's subsequent requests (client paginates
  using an undocumented cursor field; a follow-up call echoes an
  undocumented response value). Requires captured request *sequences*
  (§5). This is the only tier that gates.
- **T2 — pattern evidence:** the consumer's request behavior co-varies with
  the behavior when it varies naturally (canary windows, regional
  differences), or behavior-conditional branching is evident (e.g., retry
  patterns that differ by error *template* where status code alone can't
  explain the difference — suggestive, never proof; status-based retry
  logic produces the same traffic).
- **T3 — exposure only:** consumer receives the behavior at volume; no
  reliance signal. Reported as exposure, never as dependency.
- GPT 5.6 role: given fingerprint diffs + captured sequences, classify
  candidate dependencies into tiers with cited samples; humans promote/
  demote with one click (feedback trains thresholds). Tier definitions are
  deterministic; the LLM proposes, the rules dispose.

### 4.3 Spec subtraction
Diff observed behaviors against the declared OpenAPI spec; only *undeclared*
behaviors enter the ledger. Declared-contract violations are someone else's
product.

### 4.4 Change gate — differential replay (CI)
The gate never predicts; it **measures**:
1. CI builds base and candidate images of the API.
2. Hyrum replays a redacted, deduplicated request corpus (curated from
   captured traffic: per endpoint × consumer × behavior-class coverage,
   not raw volume) against both builds in an isolated environment — side
   effects stubbed or run against a disposable fixture DB; non-idempotent
   endpoints replayed against fixtures only.
3. Deterministic diff of observable behavior between builds: shape, values,
   ordering, error templates. Nondeterministic fields (timestamps, ids) are
   masked by the same extractors as §4.1.
4. Proven deltas are matched against the ledger → report: consumers
   affected × evidence tier × receipts.
5. GPT 5.6 role: select/prioritize which corpus slices to replay for a given
   diff (cheap prefilter), and write the human-readable impact explanation.
   It never decides *whether* a behavior changed — the replay diff does.
Policy: block on T1-matched deltas, warn on T2, note T3-exposure. Fully
configurable per team.

### 4.5 Assertions & lifecycle
- Pinning a behavior creates a compatibility assertion: owner, reason,
  expiry (default 90 days). Assertions become replay test cases — every CI
  run re-verifies them by construction.
- At expiry: prompt to document (PR against the spec, drafted by Hyrum),
  extend with justification, or schedule a deliberate break (Hyrum drafts
  the customer notice with per-consumer impact).

## 5. Architecture

- **Capture:** gateway plugin (Kong/Envoy filter) or log-pipeline tap.
  **Sampling is session-correlated, not per-request:** sample by consumer ×
  time-window (e.g., all traffic for a sampled consumer-session), so the
  request sequences T1 inference needs survive sampling. Low-volume
  consumers get boosted sampling rates (their sequences are rarer). PII
  redaction at capture (structural hashing of values; only shapes,
  templates, and redacted samples leave the VPC — self-hosted capture
  agent, SaaS control plane).
- **Store:** fingerprint aggregates in Postgres; redacted samples and replay
  corpus in object storage with TTL; ledger + assertions in Postgres.
  Ledger entries carry observation freshness; behaviors unobserved for 90
  days are marked stale and downgraded.
- **Replay harness:** containerized runner (CI-side or Hyrum-hosted),
  fixture DB seeding, side-effect stubbing config per service.
- **Analysis:** streaming fingerprint jobs; nightly dependency-inference
  runs; replay on PR.
- **Surfaces:** web app (ledger, consumer drill-down, assertion lifecycle),
  GitHub App (change-gate checks on PRs), Slack notifications, API.

## 6. Hackathon vertical slice

Demo API (small e-commerce API, 8 endpoints) + three scripted fake consumers:
consumer A paginates via undocumented `next_cursor` (T1 — the echo is in its
follow-up requests); consumer B branches on the 422 error template where
status alone can't explain it (T2); consumer C merely receives an
undocumented `legacy_id` field (T3). **Pitch discipline: consumers are
scripts and say so; what's real is capture → ledger → replay → gate.**

Demo script (≈ 4 min):
1. Replay 50k captured requests through extraction; ledger populates live —
   behaviors clustered, consumers attached, tiers assigned with receipts
   shown (A's echoed cursor on screen).
2. Open a PR that renames `next_cursor` to `cursor` **and** rewords the 422
   error template.
3. Differential replay runs in CI: base vs candidate, deterministic deltas
   found (two behaviors changed). Gate report: consumer A **blocked** (T1,
   receipt: the follow-up request that echoes the old field), consumer B
   **warned** (T2, receipt: the branching pattern), consumer C **not
   flagged** — say the false-positive discipline out loud.
4. Pin the error template → assertion with 90-day expiry, which is now a
   permanent replay test → Hyrum drafts the spec PR that would document it.

Real: extractors, session-correlated capture, tiering, replay harness, gate.
Scripted: the consumers (declared).

## 7. Success metrics

- **Precision ≥ 95% AND recall measured** on T1 dependency claims against a
  labeled corpus (planted dependencies in pilot traffic + retro-labeled real
  ones). Reporting precision without recall is prohibited by G3.
- Replay determinism: % of replay diffs that are stable across repeated runs
  (target ≥ 99% — flaky diffs kill the gate exactly like flaky tests).
- Breaks caught: retro-validation against pilot customers' past incidents.
- Assertion lifecycle health: % resolved at expiry (documented or
  deliberately broken) vs auto-extended.
- Time-to-ledger: < 1 week of traffic to first useful ledger.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| False positives → ignored gate | Tier gate (block only on T1 echo-evidence), receipts mandatory, one-click demote feeding thresholds |
| Replay environment cost/complexity (fixtures, side effects) | Start with read-path endpoints (most accidental contracts live in responses); side-effect config is explicit onboarding, not magic; Hyrum-hosted runner option |
| Nondeterministic APIs → flaky replay diffs | Masking extractors, repeated-run stability metric, quarantine flaky endpoints from the gate |
| Privacy/compliance on traffic capture | Self-hosted capture, structural fingerprints not payloads, redaction before egress, TTL on samples and corpus |
| Sampling misses low-volume consumers' sequences | Session-correlated sampling with low-volume boost (§5) |
| Incumbent adjacency (Speakeasy/Optic add observed-behavior features) | They diff against declared specs; per-consumer dependency inference + replay corpus is a different data asset. Move fast on the ledger moat |
| Assertions calcify the accident | Expiry mandatory and non-silent (G4); assertions are living replay tests, so staleness is visible |

## 9. Open questions

- Replay for write-path endpoints: fixture-DB seeding strategy per customer,
  or read-path-only for the first year?
- Internal-mesh version (service-to-service Hyrum's Law) — separate product
  or v3 surface?
- Should Hyrum eventually *drive* controlled canary variation to upgrade T2
  evidence to proof (v3, invasive)?
- Pricing axis: per monitored endpoint, per consumer, or per gated repo?
