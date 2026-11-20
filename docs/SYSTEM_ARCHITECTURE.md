# System Architecture — Proposed, Pending Repository Inspection

## Target logical architecture

```text
Teacher voice
   |
   v
Gemini client (mobile target; compatibility must be verified)
   |
   | MCP remote transport, if supported by selected client
   v
MCP Gateway / Server
   |-- Authentication middleware
   |-- Trusted principal + tenant resolver
   |-- Tool schemas and policy
   |
   v
Application orchestration services
   |-- Academic context resolver
   |-- Exam generation/validation
   |-- Exam draft/assignment workflow
   |-- Answer-sheet evaluation
   |-- Annotation renderer
   |
   +---- Abhyas adapter (INSPECT: actual callable services and schemas)
   |
   +---- Gemini provider adapter
   |
   +---- Storage adapter (Firebase/GCS; inspect existing choice)
   |
   +---- Audit/event persistence
```

## Architectural decisions

1. MCP is a protocol boundary, not the domain layer.
2. Every tool call is authenticated and authorized server-side.
3. Teacher and tenant identity are derived from validated claims and trusted application mapping.
4. Read, generate, draft, and assign operations are separate.
5. Exam creation produces a draft; assignment is a separate confirmed mutation.
6. AI evaluation is structured and evidence-linked; visual annotation is a separate renderer.
7. Original answer sheet is immutable.
8. Abhyas integration is behind an adapter and must be based on source inspection.
9. Gemini provider integration is behind an interface.
10. Gemini mobile compatibility is a blocking validation gate.

## Deployment proposal

A single modular TypeScript service on Cloud Run is the default POC deployment candidate. Use managed service identity, Secret Manager, TLS, structured logs, request limits, and a non-production service. Split services only if repository inspection or operational needs justify it.

## Not yet decided

- Exact Abhyas service adapter and persistence schema.
- OAuth issuer, audience, scopes, and callback flow.
- Gemini mobile MCP support and supported transport.
- Gemini API vs Vertex AI access path.
- Cloud region and resource sizing.
- Answer-sheet retention policy.
