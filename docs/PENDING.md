# Remaining work

The deterministic capture → ledger → replay → gate path is implemented. The following work remains
before a production pilot:

- Build and operate native gateway or log-pipeline adapters beyond the NDJSON capture agent.
- Validate WorkOS, OpenAI, GitHub, and Slack end to end with production-like sandbox tenants.
- Run release load, resilience, backup, restore, and incident-response exercises in the target
  hosting environment.
- Prove production observability, alerting, secret rotation, and deployment rollback.
- Collect pilot traffic to measure T1 precision, recall, replay stability, and time to first useful
  ledger.

Kubernetes, Kafka, hosted arbitrary-image execution, internal service meshes, and native
Kong/Envoy filters remain outside the current product scope.
