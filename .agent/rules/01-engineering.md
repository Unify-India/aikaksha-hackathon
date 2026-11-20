# Engineering Standards

- TypeScript-first for new Node services.
- Follow the existing repository package manager, formatter, lint rules, module system, and test conventions.
- Pin dependencies through lockfiles; avoid `latest` in reproducible builds.
- Prefer small modules and explicit interfaces over premature microservices.
- Separate transport, authentication, authorization, orchestration, domain services, persistence, and provider adapters.
- Use runtime schemas for every external input and model output.
- Use structured logs with correlation/operation IDs; redact tokens, keys, student answers, and PII.
- Every mutating endpoint/tool must be idempotent or explicitly detect duplicate requests.
- Add unit tests for business rules and integration tests for persistence/auth boundaries.
- Never modify Abhyas during initial discovery. Changes to Abhyas require a separate approved task/branch.
