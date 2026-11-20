# Skill: Abhyas Voice Exam Workflow Engineering

## Goal
Implement the supplied Abhyas voice-exam specification as a secure, draft-first orchestration layer that reuses verified Abhyas services.

## Mandatory references
Read `docs/ABHYAS_VOICE_EXAM_SPEC.md`, `docs/API_CONTRACTS.md`, `docs/DATA_MODEL.md` and `docs/REPOSITORY_INSPECTION.md` before coding.

## Procedure
1. Trace actual Abhyas exam/question schemas, database paths, batch ownership, teacher auth, generation, validation, publication and notification services. Record evidence; do not infer from the spec.
2. Confirm whether the source-proposed `master_exams`, `exam_questions`, `answerKey` are actual paths and determine Firestore vs RTDB.
3. Resolve the source's 45-minute/10:00–10:45 vs 10:00–11:00 inconsistency; require clarification when input values conflict.
4. Implement the four source tools: `resolve_teacher_context`, `create_exam`, `generate_and_attach_questions`, `finalize_and_publish_exam`. `teacherId` comes only from verified auth context.
5. `create_exam` creates draft only. Verify batch belongs to teacher; disambiguate fuzzy matches.
6. Generate 1–15 questions per call using server-side Gemini credentials; validate JSON and schema; deduplicate; normalize option IDs only after verifying Abhyas conventions.
7. Enforce marks, negative marks, question count, language, topic, option and schedule invariants. Report partial generation; never silently publish.
8. Partition answer fields from student payloads. Verify backend authorization/rules and serialization, not only UI visibility.
9. Present exact exam preview and require server-verifiable teacher confirmation bound to exam ID, draft version/content hash, batch and schedule before publication.
10. Make create/attach/publish idempotent. Notifications are separate and disabled for synthetic demo unless approved.
11. Test ambiguous batch, wrong tenant, invalid schedule, duplicate generation/publish, model 429/timeout/invalid JSON, answer-key leakage and stale confirmation.

## Do not
- Guess collection names, database technology, schema or callable APIs.
- Trust caller-supplied teacherId/tenantId or model-generated confirmation booleans.
- Return answer keys to student-facing clients or untrusted MCP contexts.
- publish/notify real cohorts during development.
- Reimplement exam/question-bank logic if a safe Abhyas service can be reused.
