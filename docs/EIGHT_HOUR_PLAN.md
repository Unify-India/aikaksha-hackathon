# Eight-Hour Implementation Plan

This is a time-boxed POC plan. It assumes API credentials, cloud billing, repositories, and demo accounts are available. If the Gemini mobile compatibility gate fails, switch to the agreed fallback client without changing domain services.

| Time | Workstream | Deliverable / exit gate |
|---|---|---|
| 00:00–00:45 | Environment + discovery | Both repos mapped; builds run; runtime and auth known |
| 00:45–01:15 | Client feasibility + architecture | Gemini mobile MCP decision evidenced; ADRs accepted |
| 01:15–02:15 | MCP + auth skeleton | Remote MCP endpoint; authenticated principal; read-only tool smoke test |
| 02:15–04:00 | Abhyas voice exam | `resolve_teacher_context` -> `create_exam` draft -> `generate_and_attach_questions` (1–15/call) -> validation/preview -> confirmation-bound `finalize_and_publish_exam` |
| 04:00–05:45 | Answer evaluation | Upload one sample -> Gemini interpretation -> rubric score -> uncertainty |
| 05:45–06:30 | Annotation | Derived PDF/image with red overlay; original checksum unchanged |
| 06:30–07:15 | QA/security | Cross-tenant denial, invalid token, duplicate request, model failure tests |
| 07:15–08:00 | Deploy/demo | Non-production deploy, smoke tests, demo rehearsal and fallback |

## Workstream ownership

- Human owner: architecture, identity/security decisions, product scope, deployment approval.
- Agent A: repository discovery and Abhyas adapter map.
- Agent B: MCP transport/auth/tool skeleton.
- Agent C: exam generation and validation.
- Agent D: answer evaluation and annotation.
- QA agent: independent contract, authorization and end-to-end tests.

Avoid parallel edits to the same files. Establish DTOs and service interfaces first.

## P0 acceptance criteria

1. Authenticated teacher context is resolved from verified identity.
2. Read tools cannot access another tenant's data.
3. Ten questions (or requested count) are generated and validated for a demo topic.
4. Exam draft is created.
5. Assignment requires a verifiable confirmation and is idempotent.
6. One handwritten answer sheet is evaluated against a supplied rubric.
7. Marks remain within maximum marks and uncertainty is surfaced.
8. Annotation is derived and original file checksum is unchanged.
9. Demo path uses synthetic data.
10. Gemini mobile integration is described accurately based on evidence.

## Cut line if time is lost

- Keep authentication and authorization.
- Keep draft-before-assignment.
- Keep original-file preservation.
- Keep teacher review.
- Reduce to one known-good handwritten sample.
- Use deterministic vector/text overlays; do not spend time on generative image editing.
- Do not add new product features.
\n\nUse `docs/ABHYAS_VOICE_EXAM_SPEC.md` as the source contract, `.agent/workflows/build-abhyas-voice-exam.md` as the implementation sequence, `docs/ANTIGRAVITY_KICKOFF_PROMPT.md` for initial discovery, and `docs/DEMO_RUNBOOK.md` for rehearsal. Repository inspection remains a mandatory gate.\n