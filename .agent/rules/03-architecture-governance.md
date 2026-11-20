# Architecture Governance

- Keep one canonical architecture in `docs/SYSTEM_ARCHITECTURE.md`.
- Record accepted decisions in `docs/DECISIONS.md`.
- Before changing a trust boundary, persistent schema, public contract, provider, or cloud service, submit a decision proposal.
- Do not introduce microservices unless there is a concrete deployment, isolation, or scaling reason.
- MCP tools are thin adapters; business logic belongs in application services.
- AI output is untrusted input. Parse, validate, and apply domain rules before persistence.
- Use ports/adapters for Abhyas, Gemini, storage, OCR/document processing, and annotation.
- Keep feature flags off by default until their end-to-end tests pass.
