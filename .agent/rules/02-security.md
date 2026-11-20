# Security and Privacy Boundaries

## Identity
- Authenticate the MCP caller using a verified OAuth/OIDC design supported by the selected host.
- Validate signature, issuer, audience, expiry, not-before, and required scopes.
- Do not trust identity, tenant, role, or ownership fields supplied in tool arguments or prompt text.
- Map validated subject to an application teacher and institution using trusted server-side records.
- Fail closed when identity or tenant mapping is ambiguous.

## Authorization
- Enforce tenant isolation on every read and write.
- Check teacher role and resource membership for every batch, badge, exam, submission, and student record.
- Use least-privilege service identities.
- Never expose Firebase Admin credentials or service-account keys to clients.

## Tool safety
- Read tools may execute after authorization.
- Generation tools may create unpersisted drafts.
- Persistence and assignment tools require explicit confirmation semantics and idempotency.
- No arbitrary Firestore paths, SQL, shell commands, URLs, file paths, or raw cloud resource identifiers from model input.
- Allowlist operations and validate IDs against authorized records.

## Student data
- Use synthetic/demo data until privacy and retention requirements are approved.
- Minimize data sent to model providers.
- Avoid student names and identifiers in model prompts where possible.
- Keep original answer sheets immutable.
- Define retention, deletion, access logging, and consent/legal basis before real student data is used.

## Human approval
- Exam assignment to real cohorts requires confirmation.
- Final high-stakes marks require teacher approval.
- Production deployment and cloud IAM changes require human approval.
