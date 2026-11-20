# Gemini / AI Kaksha Project Context

AI Kaksha is an AI-powered education operations platform intended to reduce teacher preparation, assessment, and administration work, especially for small institutes, individual teachers, and underserved communities.

## Hackathon POC scope

### Workflow A: conversational exam creation

A teacher asks, by voice through the chosen Gemini client, to create an exam for a subject/topic and assign it to an authorized batch/badge.

Expected flow:
1. Convert speech to a user instruction in the Gemini client.
2. Resolve authenticated teacher and institution context.
3. Resolve batch, badge, subject, and topics using read tools.
4. Generate a question draft using Gemini.
5. Validate structure, answer key, rubric/marks, topic alignment, and duplicates.
6. Create a draft through a verified Abhyas adapter or isolated POC repository.
7. Show a human-readable summary and request confirmation.
8. Assign only after explicit confirmation and server-side authorization.
9. Return an operation ID and status.

### Workflow B: subjective answer evaluation

1. Teacher provides question paper, model answers, maximum marks, and rubric.
2. Student/test submission is uploaded to controlled storage.
3. Document processor identifies pages and question regions.
4. Multimodal model extracts answer content and visual evidence.
5. Evaluator scores against explicit rubric and model answer.
6. Low-confidence, ambiguous, missing-page, or disputed results are flagged.
7. Annotation renderer creates a derived PDF/image with red-pen-style overlays.
8. Teacher reviews and approves before final publication.

## Provider separation

- Gemini is the initial model provider.
- Model calls must be behind an internal provider interface.
- Nano Banana is an optional image generation/editing capability, not the authoritative grading engine.
- The evaluator must produce structured marks and evidence independent of visual rendering.
- Never use an image generation model to silently rewrite the original answer sheet.

## Gemini mobile integration warning

Do not assume the consumer Gemini mobile app supports arbitrary custom remote MCP servers. Verify the exact supported client, account, transport, and OAuth flow. The MCP server must remain independently testable with a compatible host. If mobile custom MCP is unavailable, use an authenticated AI Kaksha client calling the same backend orchestration services; do not represent that fallback as direct Gemini mobile MCP integration.

## Source of truth

The checked-out POC and Abhyas source repositories are authoritative for code integration. Product documents describe intended capabilities, not necessarily current implementation details.
