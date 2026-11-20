# Testing and Quality

Minimum test layers:
1. Unit tests: schemas, question validation, rubric scoring policy, idempotency.
2. Authorization tests: cross-tenant denial, wrong role, expired/invalid token, resource not found.
3. Integration tests: Abhyas adapter contract, storage upload/download, Gemini response parsing.
4. End-to-end tests: voice intent -> draft -> review -> confirmed assignment; answer upload -> evaluation -> annotation -> teacher approval.
5. Failure tests: model timeout, malformed JSON, OCR uncertainty, missing pages, duplicate tool invocation, storage failure.

Do not call a test passed unless it was executed. Report skipped tests separately.
