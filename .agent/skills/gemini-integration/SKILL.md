# Skill: Gemini Integration

## Goal
Integrate Gemini for intent interpretation, question generation, and multimodal answer understanding.

## Rules
- Choose and document one initial access path: Gemini Developer API or Vertex AI.
- Verify current model IDs, region availability, quotas, billing, and supported modalities before coding.
- Hide provider SDK behind interfaces.
- Use JSON/schema-constrained outputs where supported, then validate locally.
- Treat model output as untrusted.
- Keep prompts versioned and tested.
- Add timeouts, bounded retries, rate limits, and cost telemetry.
- Minimize student personal data sent to models.
- Do not use Nano Banana as the authoritative grading engine.
- Preserve evidence and separate scoring from visual annotation.
- Never assume the consumer Gemini mobile app can connect to a custom MCP server; verify exact support and OAuth flow.
