# Skill: Subjective Answer Evaluation

## Goal
Evaluate handwritten answers against teacher-provided questions, model answers and explicit rubrics, then generate a derived annotated sheet.

## Pipeline
1. Accept PDF/image uploads with file type, size, malware, and access checks.
2. Preserve immutable original bytes and checksum.
3. Render pages and detect orientation/quality.
4. Segment question/answer regions; retain page and bounding-box provenance.
5. Use Gemini multimodal understanding to transcribe/interpret the response and cite visual evidence.
6. Score against rubric criteria, not only semantic similarity to model answer.
7. Return criterion marks, total marks, rationale, evidence region, confidence/uncertainty and review flags.
8. Validate marks bounds and totals deterministically.
9. Route uncertain, illegible, missing, or ambiguous answers to teacher review.
10. Render non-destructive red annotation overlays on a copy.
11. Keep original, machine evaluation, teacher edits, and final approved result separately versioned.

## Safety
- Model confidence is not calibrated truth.
- Do not invent a score when the answer is illegible or evidence is missing.
- Teacher approval required before final high-stakes publication.
- Never let Nano Banana rewrite the original answer sheet.
