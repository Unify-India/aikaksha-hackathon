# Product Scope — Hackathon POC

## Product context

AI Kaksha is intended as an AI-powered, end-to-end classroom management and education automation platform, particularly for small institutes and individual educators with limited digital infrastructure. The platform is teacher-led and AI-powered: teachers decide what to teach and assess; technology automates repetitive preparation and administration.

## In-scope POC capabilities

### 1. Conversational examination workflow
- Teacher expresses exam intent through voice in the selected Gemini experience.
- Resolve authorized academic context.
- Generate and validate requested questions.
- Create exam draft.
- Confirm and assign to a verified badge/batch.
- Return status and audit record.

### 2. Subjective answer-sheet evaluation
- Teacher supplies questions, model answers and rubric.
- Student answer sheet is uploaded.
- Gemini multimodal model interprets handwriting and evaluates against rubric.
- Produce marks, evidence, feedback and confidence/uncertainty.
- Generate non-destructive red-pen-style annotations.
- Teacher approves final result.

## Explicitly out of scope for eight-hour POC
Full LMS/ERP, attendance, fees, admissions, marketplace, adaptive revision engine, full proctoring, production-grade exam delivery, broad multilingual rollout, autonomous final grading without teacher review.

## Demo constraints
Use synthetic teacher, batch, badge, student and answer-sheet data. No real student data or live cohort assignment without explicit approval.
