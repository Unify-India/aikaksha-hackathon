# AI Kaksha POC Demo Runbook

## Demo safety
- Use a synthetic teacher, batch, badge and student cohort.
- Use a sample handwritten answer sheet with permission to process it.
- Keep outbound notifications disabled.
- Do not publish real exams or final student grades.
- Keep original answer-sheet files immutable; annotations are derived artifacts.

## Voice exam happy path
1. Authenticate as the synthetic teacher.
2. Ask: “Create a 45-minute NEET practice exam for batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and one-fourth negative marking, tomorrow from 10:00 AM to 10:45 AM.”
3. Agent resolves teacher context and authorized batches. If more than one batch matches, ask the teacher to choose.
4. Agent extracts normalized parameters and confirms any ambiguity, including institute timezone.
5. `create_exam` creates a draft.
6. `generate_and_attach_questions` generates up to 15 questions per call; validate schema, options, answer keys, marks, language and duplicates.
7. Show question count and preview. If fewer than 15 are valid, tell the teacher and do not proceed as if complete.
8. Teacher reviews preview and requests any edits.
9. Prepare publish confirmation bound to the exact draft version/content hash, batch and schedule.
10. Teacher explicitly confirms. `finalize_and_publish_exam` verifies confirmation and idempotency, then assigns/publishes to the synthetic cohort.
11. Verify student view contains no correct answers or explanations.

## Subjective answer-sheet happy path
1. Upload a synthetic handwritten answer sheet and select the matching question/model answer/rubric.
2. Preserve the original file and checksum.
3. Run multimodal extraction/evaluation; capture evidence per criterion, awarded marks, uncertainty and confidence.
4. Validate awarded marks do not exceed criterion/question maximums.
5. Render red-pen annotations onto a new PDF/image artifact using deterministic overlays.
6. Show teacher the extracted answer, rubric breakdown, annotations and uncertainty flags.
7. Teacher edits/approves the score. The machine score is not the final grade until teacher approval.

## Failure demonstrations worth testing
- ambiguous batch
- wrong teacher or tenant
- duration/end-time mismatch
- invalid model JSON
- fewer questions than requested
- Gemini 429 or timeout
- duplicate tool call
- stale publish confirmation
- attempt to read answer key as student
- unreadable handwriting / uncertain OCR
- annotation renderer failure while preserving original

## End-of-demo checks
- show draft and final status transitions
- show answer-key separation
- show audit trail/idempotency
- show original file checksum unchanged
- show teacher review state
- describe Gemini mobile integration only to the extent actually tested
