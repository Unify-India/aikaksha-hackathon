# Abhyas Autonomous Voice & Agent Workflow — Source Contract

**Source:** user-provided *Abhyas Autonomous Voice & Agent Workflow Specification* (uploaded 2026-11-20).  
**Status:** requirements baseline; repository implementation is NOT VERIFIED.

This document preserves the supplied specification's terminology and values. It is not evidence that the current Abhyas code, Firestore rules, or APIs already match it.

## 1. Target interaction

Teacher speaks a request such as: “Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.”

Intended stages:
1. Speech/audio ingestion and intent extraction.
2. Normalize parameters and resolve batch, syllabus, subject, topic/subtopic and class level.
3. Initialize an exam draft and compute schedule timestamps.
4. Generate, normalize, deduplicate and validate questions.
5. Partition metadata, student-visible questions and teacher-only answer key.
6. Only after teacher review/confirmation, publish/assign and notify.

## 2. Exam parameter contract

| Field | Type | Required | Default / rule |
|---|---|---:|---|
| `title` | string | yes | auto-generated; non-empty |
| `batchId` | string | yes | must belong to authenticated teacher |
| `duration` | integer minutes | yes | default 60; > 0 |
| `targetQuestions` | integer | yes | default 10; > 0 |
| `defaultMarks` | number | yes | default 4; 1–20 |
| `negativeRule` | enum | no | `none`, `1/2`, `1/3`, `1/4`; default `none` |
| `defaultNegativeMarks` | number | computed | `defaultMarks × fraction` |
| `allowedAttempts` | integer | no | default 1; >= 1 |
| `date`, `endDate` | ISO date | yes | default today |
| `startTime`, `endTime` | `HH:mm` | yes | defaults `00:00`, `23:59` |
| `startTimestampMs`, `endTimestampMs` | number | computed | Unix epoch milliseconds |
| `languages` | string[] | yes | default `['en']`; at least one |
| `primaryLanguage` | string | yes | default `en`; must be in `languages` |
| `subject` | string | yes | from batch unless explicitly resolved |
| `classLevel` | string | no | from batch |
| `examPattern` | string | no | default `CBSE`; e.g. `NEET`, `JEE`, `CBSE`, `ICSE` |
| `shuffleQuestions`, `shuffleOptions` | boolean | no | default true |
| `hasSections` | boolean | no | default false |
| `omrConfig` | object | no | default standard; presets `standard`, `bpsc`, `custom` |
| `status` | enum | yes | `draft`, `upcoming`, `live`, `open`; draft during generation |

**Schedule consistency check:** the example says 45-minute duration and 10:00–10:45, but the Tool 2 JSON example later says `endTime: 11:00`. Treat the spoken duration and explicit end time as separate inputs; if inconsistent, ask the teacher to resolve before creating/publishing. The invariant is `startTimestampMs < endTimestampMs` and window length must be at least `duration × 60,000` ms. Time zone must be explicit/resolved from the institute configuration; inspect Abhyas behavior before choosing a source.

## 3. Question contract

Supported types: `MCQ`, `Numeric`, `Short Text`, `Subjective`.

`IExamQuestion` fields from the source:
- `id: string`
- `type: "MCQ" | "Numeric" | "Short Text" | "Subjective"`
- `marks: number` (1–20)
- `negativeMarks: number` (0–marks)
- `subject`, `topic`; optional `subtopic`
- `difficulty: "easy" | "medium" | "hard"`
- optional `classLevel`, `examPattern`
- optional localized `en` and `hi` content blocks (`text`, optional options)
- optional `correctOptionId` for MCQ; optional `answer` for numeric/short text
- optional localized `explanation`

The supplied interface names MCQ option IDs `opt1`–`opt4`; its sample model output uses `A`–`D` and says the normalizer maps those to `opt1`–`opt4`. Preserve this normalization boundary. The spec elsewhere permits 2–5 options; validate against the actual Abhyas option model before final mapping.

## 4. Gemini generation contract

The supplied spec proposes:
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Default model: `gemini-2.5-flash`
- Key lookup hierarchy: teacher `users/{uid}.geminiApiKey`, then `app_config/admin_ai.geminiApiKey`.
- Inputs: topic, subtopic, count (1–15 per call), difficulty, examPattern, languages, `excludeQuestions`, `promptGuideline`.
- Output: JSON question array with localized content, options, correct option, explanation, difficulty and topic.

**Security decision:** do not expose API keys to the voice agent, browser, MCP tool output or student client. Before implementing the source's per-teacher-key hierarchy, inspect current credential storage, authorization, encryption/secret handling and policy. Prefer server-side managed secrets/credentials. Any platform fallback must be deliberate and auditable. Model and endpoint availability must be checked against the configured Google project at implementation time.

## 5. Abhyas storage partition described by source

1. `master_exams/{examId}` — metadata, `batchId`, duration, timestamps, OMR rules, section definitions; no question array or empty array.
2. `exam_questions/{examId}` — student-visible statements/options/images; remove `correctOptionId`, `answer`, `explanation`.
3. `answerKey/{examId}` — teacher/auto-grader-only map `questionId -> { correctOptionId, answer, explanation, marks, negativeMarks }`.

These are source-proposed collection paths. **Do not create/use them until confirmed in Abhyas source and Firebase rules.** Verify whether these are Firestore collections, RTDB paths, nested docs, or logical names; the supplied text references Firebase RTDB security rules for timestamp enforcement while naming document-like paths. Resolve that distinction in repository inspection.

## 6. Four source-proposed MCP tools

### `resolve_teacher_context`
- Input: none; `teacherId` is injected from verified auth session.
- Output: teacher's authorized batches `{id,name,subject,classLevel}` and recent exams; do not return secrets.
- Operationally also resolve syllabus/topic/subtopic where supported. Disambiguate fuzzy batch matches; never guess when multiple candidates match.

### `create_exam`
Input fields in supplied example: `title`, `batchId`, `duration`, `targetQuestions`, `defaultMarks`, `negativeRule`, `date`, `startTime`, `endTime`, `languages`, `isSubjective`.  
Output: `{examId,status:"draft"}`.

### `generate_and_attach_questions`
Input: `examId`, `subject`, `topic`, `subtopic`, `count`, `difficulty`, `languages`, `guidelines`.  
Output: `{generatedCount,questions}` in the source example. For safety, MCP response should return bounded preview/validation data and opaque references rather than answer-key data to an untrusted client. Attach/persist only through trusted server-side Abhyas service after validating ownership and draft state.

### `finalize_and_publish_exam`
Input in source: `{examId,status:"upcoming"}`.  
Output: `{success,examUrl}`.  
**POC safety adaptation:** do not let a model invoke publication solely by passing `status`. Require a separate, server-verifiable teacher confirmation bound to the exact exam preview, recipient batch, schedule and content hash. The tool should first validate and prepare a publish operation; final commit must verify confirmation, teacher ownership, authorization, idempotency and current draft version. Real notifications are a separately approved side effect.

## 7. Required guardrails

- Batch ambiguity: ask the teacher to choose between matching batches (example: “12 A” vs “12 NEET”).
- `0 <= negativeMarks <= marks`.
- `startTimestampMs < endTimestampMs` and schedule window >= duration.
- If fewer than requested questions are generated (e.g. 12/15), disclose shortfall; never silently publish.
- MCQ options: 2–5 per source guardrail; correct option must exist among normalized option IDs. Source also lists `opt1`–`opt4`; inspect actual Abhyas contract for 5-option compatibility.
- HTTP 429: report quota/rate limit; retry with bounded exponential backoff and jitter, honoring `Retry-After` where available. Do not promise a fixed 30-second retry unless policy/response supports it.
- Deduplicate against existing questions supplied through authorized server-side retrieval; do not send unnecessary student or tenant data to the model.
- All writes must be idempotent and tenant/teacher scoped.

## 8. POC acceptance tests

1. Resolve authenticated teacher context with no caller-supplied teacher ID.
2. Batch exact match, fuzzy single match, ambiguous match and unauthorized batch cases.
3. Parse a spoken-style request into normalized fields and ask for missing/contradictory schedule details.
4. Create draft only; confirm no student notification or assignment yet.
5. Generate requested count in calls of at most 15; validate schema, topic, language, marks, options and answer key.
6. Handle short generation, duplicate candidates, invalid JSON, model timeout and 429.
7. Confirm answer fields are absent from student-facing question payload and inaccessible via student rules/API.
8. Reject publish without valid confirmation; reject stale preview/hash, wrong teacher, wrong batch and duplicate commit.
9. Publish/assign only to synthetic demo cohort unless explicit human approval for real students.
10. Verify timestamp/time-zone behavior in the actual Abhyas runtime and security rules.

## 9. Repository inspection checklist — must be completed

- Find actual `master_exams`, `exam_questions`, `answerKey` references and determine backing database.
- Find exam create/edit/publish services and their server-side callable entry points.
- Find question-generation service, prompt/schema, normalization and deduplication logic.
- Find `IExamQuestion` (or actual equivalent) and option ID conventions.
- Find teacher auth/role/tenant claims and batch ownership checks.
- Find schedule/time-zone calculation and student start/submit enforcement.
- Find Firebase rules and cloud functions enforcing answer-key privacy.
- Find notification adapters and disable them for synthetic/demo mode.
- Record exact file paths, symbols, tests and reuse recommendation in `docs/REPOSITORY_INSPECTION.md`.
