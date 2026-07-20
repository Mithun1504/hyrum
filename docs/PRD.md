# Product requirements

Hyrum finds undocumented API behavior that consumers rely on and tests proposed changes against it.

## Problem

OpenAPI records declared contracts. Consumers also learn from observable behavior: field presence,
nullability, ordering, undocumented values, and error templates. Teams usually discover these
accidental contracts after a breaking release.

Existing contract and spec-diff tools check what a team declared. Hyrum records what each consumer
observed, distinguishes exposure from evidence of reliance, and checks candidate builds before
merge.

## Users

- **Primary:** platform and API team leads responsible for external compatibility.
- **Secondary:** developer experience, API support, and SRE teams reviewing impact and evidence.
- **Initial customer:** a B2B company with at least 50 external API consumers, a controllable
  gateway or log pipeline, and containerized API builds.

## Product requirements

1. Build a per-consumer ledger of behavior not declared in OpenAPI.
2. Attach redacted receipts and an evidence tier to every claim.
3. Replay a representative corpus against base and candidate builds.
4. Match stable behavior deltas to affected consumers and their evidence.
5. Apply a tenant policy: T1 may block, T2 may warn, and T3 never blocks.
6. Turn pinned behavior into owned, expiring compatibility assertions.
7. Measure T1 precision and recall. An empty ledger does not count as safe.

## Evidence model

| Tier | Meaning | Gate effect |
| --- | --- | --- |
| **T1: echo evidence** | A response-only value appears in a later request from the same complete consumer session. | Eligible to block under policy. |
| **T2: pattern evidence** | Request behavior changes with an observed response pattern, but reliance is not proven. | Warn only. |
| **T3: exposure** | A consumer received the behavior. | Never blocks and is not called a dependency. |

Humans may override a claim with an auditable reason. Overrides do not change the underlying
receipt.

## Behavior extraction

For each endpoint and consumer, deterministic extractors record:

- present, absent, null, type, casing, enum-like values, and undeclared fields;
- array ordering when pagination context exists;
- status and normalized error templates.

Timing and latency are excluded. Capture and replay must use the same versioned extractor and mask
configuration.

Only behavior missing from the uploaded OpenAPI document enters the accidental-contract ledger.

## Capture and privacy

- Sample complete consumer sessions, not isolated requests.
- Preserve sequence numbers and completeness so T1 can be proved.
- Boost low-volume consumers when sampling.
- Redact bodies, credentials, cookies, signed values, and configured sensitive paths before egress.
- Derive consumer identity with tenant-keyed HMAC and discard the source credential.
- Store aggregates in Postgres and redacted, expiring artifacts in object storage.
- Mark unobserved behavior stale after 90 days without deleting its history.

Capture failures must never interrupt customer traffic.

## Differential replay

1. CI identifies immutable base and candidate images.
2. Hyrum selects a redacted corpus by endpoint, consumer, and behavior coverage.
3. The runner starts both images in isolated Docker networks with the same fixtures and stubs.
4. It sends identical requests, applies deterministic masks, and compares observable results.
5. It repeats changed cases. Unstable results are quarantined and cannot block.
6. It signs the report. The control plane verifies the signature and recomputes the decision.

Write endpoints require a disposable database and explicit side-effect stubs. Public egress is off
by default.

## Assertions

Pinning behavior creates an assertion with an owner, reason, and expiry. Every replay must report
signed coverage for active assertions; missing or failed coverage blocks.

At expiry, an owner must:

- document the behavior;
- extend the assertion with a reason; or
- schedule a deliberate break and customer notice.

## AI boundary

GPT-5.6 may cluster and name extracted behavior, propose tiers, rank replay cases, explain impact,
draft OpenAPI changes, or draft notices. Every result is schema-validated and advisory.

The model cannot create behavior facts, promote unsupported evidence to T1, alter replay results, or
set a gate decision.

## Product surfaces

- Web workspace for capture status, ledger review, consumers, endpoints, gates, assertions, replay,
  and policy.
- Control-plane API and progress stream.
- GitHub checks for pull-request decisions.
- Slack notifications for review and lifecycle events.
- Go capture and replay binaries.

## Non-goals

- API gateway, observability platform, or error tracker.
- Traffic blocking or response modification.
- Timing and latency contracts.
- Internal service meshes in the current version.
- Kubernetes or Kafka in the current architecture.

## Success measures

- T1 precision of at least 95%, with recall reported on the same labeled corpus.
- Stable output for at least 99% of replayed deltas.
- First useful ledger within one week of traffic.
- Pilot incidents caught in retrospective replay.
- Expired assertions resolved by documentation or a planned break rather than silent extension.

## Open decisions

- Scope of write-path replay during the first production pilot.
- Pricing by monitored endpoint, consumer, gated repository, or a combination.
- Whether controlled canary variation should later upgrade T2 evidence.
