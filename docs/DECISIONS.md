# Architecture Decision Log

Status values: PROPOSED, ACCEPTED, REJECTED, SUPERSEDED.

## ADR-001: POC is a thin integration layer
Status: PROPOSED
Decision: Build MCP and AI orchestration as a separate POC service; reuse Abhyas through a verified adapter.
Reason: Avoid duplicating exam/question-bank business logic.
Human review: Confirm repository boundary and integration method.

## ADR-002: MCP tools do not contain domain logic
Status: PROPOSED
Decision: MCP handlers validate/authenticate and delegate to application services.
Reason: Reuse services from MCP, web app, and future mobile client.

## ADR-003: Exam draft and assignment are separate
Status: PROPOSED
Decision: Create draft first; assign only after verifiable teacher confirmation.
Reason: Prevent unintended cohort distribution.

## ADR-004: Grading engine and annotation renderer are separate
Status: PROPOSED
Decision: Gemini multimodal understanding + rubric scoring produce structured evaluation; renderer creates derived red-pen overlay.
Reason: Image generation is not the authoritative grading engine and must not rewrite originals.

## ADR-005: Gemini mobile MCP is a feasibility gate
Status: PROPOSED
Decision: Verify exact mobile client support before promising direct integration.
Fallback: Authenticated AI Kaksha client using Gemini APIs and the same backend services.
Human review: Select demo path after compatibility test.

## ADR-006: One modular Cloud Run service for POC
Status: PROPOSED
Decision: Start with a modular service, not multiple microservices.
Reason: Eight-hour timebox and simpler deployment.
Human review: Confirm after repository/runtime inspection.

## ADR-007: Synthetic data for demo
Status: PROPOSED
Decision: Use synthetic teacher/batch/student/submission data.
Reason: Reduce privacy risk and avoid production side effects.
