# Skill: Security Audit

## Audit checklist
- Authentication signature/issuer/audience/expiry/nbf validation.
- Scope and role validation.
- Trusted subject-to-teacher/tenant mapping.
- Cross-tenant read/write denial.
- Resource ownership checks.
- No user-controlled arbitrary document paths or URLs.
- Prompt injection treated as untrusted content.
- Model output schema validation.
- Secret scanning and log redaction.
- Upload MIME/size limits and safe storage permissions.
- Idempotency and replay protections for mutating tools.
- Rate limits and abuse controls.
- Audit trail for exam creation, assignment, evaluation and approval.
- No real-student data in demo fixtures.
- CORS/CSRF protections where browser clients are involved.

Produce findings by severity with reproduction steps and remediation. Do not change IAM or production policy yourself.
