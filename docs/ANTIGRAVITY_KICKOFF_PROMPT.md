# Antigravity Kickoff Prompt — AI Kaksha POC

Paste this into Antigravity after opening the POC repository root.

---

Read `AGENTS.md`, `GEMINI.md`, every file in `.agent/rules/`, and these documents:
- `docs/PRODUCT_SCOPE.md`
- `docs/ABHYAS_VOICE_EXAM_SPEC.md`
- `docs/API_CONTRACTS.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY_MODEL.md`
- `docs/REPOSITORY_INSPECTION.md`
- `docs/EIGHT_HOUR_PLAN.md`

**First task: discovery only. Do not implement or modify Abhyas.**

Inspect this POC repository and the separately located Abhyas repository. Record:
1. Git remotes, branches, commits, runtime, package manager, lockfiles, build/test commands.
2. Exact exam/question models and the actual backing database.
3. Exact implementations for exam draft creation, question generation, normalization, deduplication, validation, question attachment, publication and assignment.
4. Teacher authentication, roles, tenant/institute boundaries, batch ownership and badge access.
5. Actual student-visible question serialization and answer-key read/write protection.
6. Schedule/timezone calculation and student start/submission enforcement.
7. Gemini credential handling, current model configuration, quota/error handling.
8. Notification side effects and how to disable them in demo mode.
9. Existing subjective-answer submission, storage, evaluation and PDF/image annotation capabilities.

Map the four source-specified tools to real server-side functions:
- `resolve_teacher_context`
- `create_exam`
- `generate_and_attach_questions`
- `finalize_and_publish_exam`

For every mapping, include exact file path, symbol/function, input/output shape, authorization check, tests and reuse recommendation. Clearly mark anything not found.

Resolve these source-spec discrepancies as explicit questions, not guesses:
- 45-minute example ends 10:45, while a later JSON example ends 11:00.
- `opt1`–`opt4` interface vs `A`–`D` generation output; another guardrail allows 2–5 options.
- document-like collection paths vs reference to Firebase RTDB rules.
- teacher/admin document API-key hierarchy and security implications.

Verify Gemini mobile's exact custom MCP, remote transport and OAuth support with the target app/account. Do not claim Gemini mobile integration unless a read-only authenticated tool call succeeds.

Update `docs/REPOSITORY_INSPECTION.md` with evidence. Then produce a concise report:
- confirmed reusable Abhyas services
- adapter boundary
- missing capabilities
- security risks
- runtime constraints
- Gemini mobile feasibility and fallback
- human decisions needed before implementation

Stop and request human review for architecture, auth/security, schema, credential, provider/cost and deployment decisions. Do not create cloud resources, change IAM, publish exams, send notifications or use real student data.
