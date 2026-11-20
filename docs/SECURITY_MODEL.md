# Security Model — Draft

## Assets
Teacher identity, institution/tenant data, batch/badge membership, exam content, question bank, student submissions, marks, model answers, credentials, audit events.

## Trust boundaries
1. Gemini client and its model context.
2. Remote MCP network boundary.
3. MCP authentication middleware.
4. Application services.
5. Abhyas/Firebase/GCP persistence.
6. External model providers.
7. Teacher approval interface.

## Required controls
- TLS for remote traffic.
- Verified OAuth/OIDC tokens appropriate to the selected MCP host.
- Signature, issuer, audience, expiry, not-before, and scopes checked.
- Trusted identity mapping; no caller-selected teacher/tenant.
- Per-resource authorization and tenant filtering.
- Least-privilege Cloud Run service identity.
- Secret Manager for deployed secrets.
- Upload size/type checks and private object access.
- Rate limits and quotas.
- Idempotency keys for writes.
- Audit trail for create, assign, evaluate, approve, and publish.
- PII minimization and retention controls.
- Prompt injection and model outputs treated as untrusted.

## Confirmation model
A model-generated statement or `confirmed=true` argument is not proof of user approval. Use a client-supported confirmation/elicitation mechanism or a separate authenticated confirmation endpoint/UI that binds approval to a specific draft, teacher, tenant, and expiry.

## Demo policy
Synthetic data only. Disable live cohort assignment by default.
