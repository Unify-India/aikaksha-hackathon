# Repository Inspection Report

Status: NOT STARTED. This document must be completed by inspecting the actual repositories.

## Repositories

| Item | POC | Abhyas |
|---|---|---|
| Absolute path | INSPECT | INSPECT |
| Git remote/branch/commit | INSPECT | INSPECT |
| Runtime version | INSPECT | INSPECT |
| Package manager/lockfile | INSPECT | INSPECT |
| Build/test commands | INSPECT | INSPECT |
| Firebase project/config | INSPECT | INSPECT |
| Authentication model | INSPECT | INSPECT |

## Abhyas feature discovery

| Capability | Dossier lead | Actual source path/symbol | Callable server-side? | Tests | Status |
|---|---|---|---|---|---|
| Exam creation | teacher exam/question management | INSPECT | INSPECT | INSPECT | NOT VERIFIED |
| Question bank CRUD | question management | INSPECT | INSPECT | INSPECT | NOT VERIFIED |
| AI question generation | Gemini service | INSPECT | INSPECT | INSPECT | NOT VERIFIED |
| Batch and badge lookup | batch management | INSPECT | INSPECT | INSPECT | NOT VERIFIED |
| Exam assignment | exam management | INSPECT | INSPECT | INSPECT | NOT VERIFIED |
| Teacher identity/roles | auth services | INSPECT | INSPECT | INSPECT | NOT VERIFIED |
| Subjective paper/model answers | subjective questions | INSPECT | INSPECT | INSPECT | NOT VERIFIED |
| File storage/PDF pipeline | Firebase Storage/PDF | INSPECT | INSPECT | INSPECT | NOT VERIFIED |

## Required trace for exam lifecycle

Document exact path and function names:

1. Teacher UI entry point:
2. Request/DTO:
3. Domain/service layer:
4. Question generation:
5. Question validation:
6. Persistence:
7. Assignment:
8. Batch/badge authorization:
9. Audit/status:
10. Tests:

## Required trace for subjective evaluation

1. Existing question/model answer representation:
2. Student submission representation:
3. Upload/storage:
4. PDF/image processing:
5. Evaluation:
6. Marks persistence:
7. Teacher review:
8. Existing annotation/PDF utilities:
9. Tests:

## Integration recommendation

For each candidate, choose:
- REUSE SERVICE
- EXTRACT SERVICE
- ADAPTER TO EXISTING API
- TEMPORARY POC IMPLEMENTATION
- NOT AVAILABLE

Include coupling, security, and migration implications.

## Runtime compatibility

Record Node, TypeScript, Firebase Admin, Functions runtime, Angular/Ionic versions and package manager. Do not upgrade Abhyas during the POC unless explicitly approved.

## Gemini mobile compatibility evidence

Record:
- App name and version:
- Account/workspace eligibility:
- Custom MCP/extension support:
- Remote HTTP transport support:
- OAuth flow supported:
- Documentation/source of confirmation:
- Minimal read-only tool test:
- Result:
- Fallback selected:

## Open questions
List unresolved decisions and assign an owner.


## Additional Abhyas voice-spec trace (required before adapter coding)

| Spec element | Evidence to locate | Result |
|---|---|---|
| `master_exams/{examId}` | exact model/path, backing store, create/update call | INSPECT |
| `exam_questions/{examId}` | student serialization and write path | INSPECT |
| `answerKey/{examId}` | protected write/read path and rules | INSPECT |
| `IExamQuestion` | actual interface, option ID enum, 2–5 option support | INSPECT |
| `resolve_teacher_context` | auth-derived teacher, batch query and ownership checks | INSPECT |
| `create_exam` | existing draft creation service/callable | INSPECT |
| `generate_and_attach_questions` | Gemini service, prompt, schema parser, dedupe | INSPECT |
| `finalize_and_publish_exam` | validation, partition, state transition, notification side effects | INSPECT |
| Schedule invariants | timezone source, timestamp calculation, RTDB/Firestore rules | INSPECT |
| Credential hierarchy | teacher key and platform fallback storage/security | INSPECT |

### Source-spec discrepancies to resolve

- The prose example is 45 minutes, 10:00–10:45; the Tool 2 JSON example uses 10:00–11:00. Agent must ask the teacher when explicit schedule and duration conflict.
- The question interface uses `opt1`–`opt4`; generation example returns `A`–`D`; another guardrail allows 2–5 options. Verify actual Abhyas model and normalization.
- The source names `master_exams`, `exam_questions`, `answerKey` with document-like paths but references Firebase RTDB security rules. Confirm actual database technology and rule enforcement.
- Source key hierarchy stores API keys on user/admin documents. Inspect current handling; never expose keys to clients or agent context. Human security review required before reusing.
