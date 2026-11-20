# Data Model — Source-Proposed Abhyas Layout and POC Logical Records

**Important:** The collection/path names below come from the supplied Abhyas specification, not verified source inspection. Do not create new production collections or alter Firebase rules until `docs/REPOSITORY_INSPECTION.md` confirms actual backing stores and contracts.

## Source-proposed exam partition

| Path/name | Intended content | Must not contain |
|---|---|---|
| `master_exams/{examId}` | metadata, batchId, duration, timestamps, OMR rules, sections, status | answer key; question content array should be empty/omitted |
| `exam_questions/{examId}` | student-visible question statements, options, images | `correctOptionId`, `answer`, `explanation` |
| `answerKey/{examId}` | `questionId -> {correctOptionId, answer, explanation, marks, negativeMarks}` | public/student-readable data |

The source mentions Firebase RTDB security rules for timestamp enforcement but uses document-like path notation. Confirm Firestore vs RTDB vs another abstraction before implementing.

## Exam lifecycle states

POC orchestration: `draft` → `validated` → `publish_pending_confirmation` → `upcoming` (or approved target state). Source Abhyas status values also include `live`, `open`. Map to actual Abhyas lifecycle only after inspection. Do not invent a parallel production lifecycle.

## Question snapshot

Use the source `IExamQuestion` contract in `ABHYAS_VOICE_EXAM_SPEC.md` as the mapping baseline. Preserve localized `en`/`hi`, question type, marks, negativeMarks, subject/topic/subtopic, difficulty, optional classLevel/examPattern, options, correctOptionId/answer and explanation in trusted representation. Split the student-visible and answer-key representations before persistence/response.

## POC-only orchestration metadata (logical, not mandated DB schema)

- `operationRef`, `idempotencyKey`, `draftVersion`, `contentHash`
- `createdByTeacherRef` (derived from auth)
- `confirmationRef` bound to exam, batch, schedule and content hash
- `generationModel`, `promptVersion`, `schemaVersion`, validation warnings
- audit event with actor, action, timestamp and outcome

Store these using existing Abhyas conventions where possible. Do not add collections until approved.

## Data rules

- Tenant/teacher scope on every query and mutation.
- Answer key server-side only; verify rules and API serialization, not just UI hiding.
- Original source records and student submissions are not overwritten by AI operations.
- Model output is untrusted input; parse and validate strictly.
- Keep audit history and model/prompt/schema versions for reproducibility.
