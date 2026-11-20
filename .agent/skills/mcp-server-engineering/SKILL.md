# Skill: MCP Server Engineering

## Goal
Build a secure remote MCP server exposing narrow education tools.

## Requirements
- Use the official TypeScript MCP SDK and a supported remote HTTP transport.
- Pin the SDK version and follow its current server/transport API.
- Keep MCP handlers thin; call application services.
- Validate every input with runtime schemas.
- Bind every call to a verified authenticated principal.
- Derive teacher and tenant from trusted server-side identity mapping.
- Enforce authorization in application services, not only in tool descriptions.
- Return concise structured results and safe error codes.
- Add request/operation IDs, timeouts, bounded retries for safe operations, and idempotency keys for writes.
- Do not return secrets, raw stack traces, unrestricted student data, or arbitrary storage URLs.

## Tool groups
Read: `get_teacher_context`, `list_teacher_batches`, `list_batch_badges`, `list_subject_topics`, `get_exam_status`.
Generate/validate: `generate_exam_questions`, `validate_exam_draft`.
Write: `create_exam_draft`, `assign_exam_to_badge`.

## Write semantics
- Creating an exam creates a draft only.
- Assignment is a separate operation.
- Assignment requires explicit user confirmation represented by a server-verifiable confirmation flow or host-supported elicitation/confirmation mechanism.
- If the selected MCP client cannot safely support that mechanism, use a separate authenticated confirmation UI/API.
- Never trust a boolean `confirmed: true` from an LLM as sufficient proof by itself.

## Compatibility
Test server independently with a compatible MCP inspector/host. Do not claim Gemini mobile support until the exact client integration is verified.
