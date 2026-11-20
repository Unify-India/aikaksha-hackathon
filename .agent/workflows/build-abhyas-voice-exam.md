# Workflow: Build the Abhyas Voice Exam POC

## Gate 0 — Read source contract and inspect repositories

1. Read `AGENTS.md`, `.agent/rules/`, `docs/ABHYAS_VOICE_EXAM_SPEC.md`, `docs/API_CONTRACTS.md` and `docs/REPOSITORY_INSPECTION.md`.
2. Locate both POC and Abhyas repositories. Do not edit Abhyas during discovery.
3. Trace actual exam schema, question schema, question generation, batch lookup, teacher authorization, exam create/publish, answer-key partition, scheduling and notifications. Record exact paths/symbols/tests.
4. Stop and report if the existing backend cannot safely enforce teacher/tenant scope or answer-key privacy.

## Gate 1 — Resolve decisions

1. Confirm actual backing store (Firestore/RTDB/etc.) and current status lifecycle.
2. Resolve timezone source and schedule conflict handling.
3. Verify Gemini mobile custom MCP/remote transport/OAuth support with the exact app/account. Do not claim integration without a successful read-only test.
4. Human approves adapter boundary, identity model, credential source, schema mapping and fallback client.

## Gate 2 — Implement in POC repository

1. Define typed DTOs from `docs/API_CONTRACTS.md`; map to Abhyas via an adapter.
2. Implement `resolve_teacher_context` read-only first.
3. Implement `create_exam` as draft-only and idempotent.
4. Implement Gemini generation with strict JSON/schema validation, max 15 per call, deduplication, bounded retries and shortfall reporting.
5. Normalize option IDs to actual Abhyas conventions; never assume the proposed `opt1`–`opt4` model matches source.
6. Attach generated questions to draft using an existing server-side Abhyas service.
7. Validate the full draft and present a human-readable preview.
8. Implement two-phase publish: prepare confirmation, then verify server-issued confirmation + content hash + teacher + batch + schedule before commit.
9. Keep notifications off for synthetic demo data unless explicitly approved.

## Gate 3 — Verify

Test ambiguous/unauthorized batch, invalid schedule, duration/end-time mismatch, bad model JSON, duplicate question, count shortfall, 429, timeout, answer-key leakage, wrong teacher, stale confirmation, duplicate publish and partial failures.

## Definition of done

A teacher can use a supported voice client to resolve their own batch, create a draft, generate/validate questions, review a preview and explicitly confirm a single idempotent assignment to a synthetic cohort. No secret or answer key is exposed to students. Gemini mobile claims match tested evidence.
