# Workflow: Pre-Demo Validation

## Environment
- `scripts/doctor.sh` passes.
- Environment variables are present without printing values.
- Cloud project, billing, API quotas and region confirmed.
- Demo credentials are least-privilege and contain synthetic data.

## Exam journey
- Gemini client can invoke the intended tools (client compatibility explicitly evidenced).
- Authenticated teacher context resolves correctly.
- Batch/badge/topic resolution is tenant-scoped.
- Generated questions pass validation.
- Draft preview is correct.
- Assignment requires confirmation.
- Duplicate invocation does not duplicate assignment.

## Evaluation journey
- Original answer-sheet checksum remains unchanged.
- Correct question/page segmentation.
- Marks stay within rubric bounds.
- Uncertainty is flagged.
- Annotation is a derived copy/overlay.
- Teacher can review and approve.

## Operations
- Logs are useful and redacted.
- Rate limits/timeouts work.
- Fallback sample and recorded walkthrough exist.
- No production data or production cohort is used.
