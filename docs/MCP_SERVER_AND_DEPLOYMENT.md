# AI Kaksha — Exam AI Pipeline, MCP Server and Deployment

> **Audience:** developers working on `functions/` and whoever deploys the backend.
> **Status:** merged to `main` in PR #5 (`feat/ai-prompts`). Firebase project `abhyas-unify`, region `asia-south1`.

This document covers two things:

1. **What changed:** the real Gemini exam pipeline and the MCP server that AI clients connect to.
2. **How to deploy it** and connect clients (Gemini app, Antigravity, Gemini CLI, Claude).

---

## 1. What changed

### 1.1 Real Gemini exam pipeline (replaces the placeholders)

Before this change, `generate_and_attach_questions` saved the same hard-coded question N times, and `audit_question_batch` always returned `100 / PASSED`. Both now call Gemini.

| Step | File | What it does |
|---|---|---|
| Gemini provider | `functions/src/providers/gemini.provider.ts` | `generateJson()`: structured JSON output validated with zod, retries with backoff for 429 / 5xx / timeouts / invalid JSON, `v1beta` API pinned. No retry when the **daily** quota is used up (fails fast). |
| Understand the request | `functions/src/prompts/intent-extraction.prompt.ts` | Teacher sentence → settings (batch, subject, topic, count, marks, date words, times). The model never computes dates. |
| Resolve the schedule | `functions/src/utils/schedule.ts` | Date words + times → exact IST timestamps. Errors instead of guessing (`MISSING_DATE`, `DURATION_MISMATCH`, `START_IN_PAST`, `WEEKDAY_MISMATCH`, …). |
| Plan the exam | `functions/src/modules/workflows/examPlan.ts` | Merges the intent with explicit values, resolves the batch by name, takes the subject from the batch, returns the plan or what is missing. |
| Write questions | `functions/src/prompts/question-generation.prompt.ts` | Parallel batches of ≤5 MCQs, one subtopic per batch, checked (`question-checks.ts`) and de-duplicated. A shortfall is reported, never padded. |
| Blind answer check | `functions/src/prompts/solver-audit.prompt.ts` | Gemini solves each question **without the key**; mismatches and problems (ambiguous, two correct options, missing data) become flags. Score = % of questions confirmed. |
| Auto DPP | `functions/src/prompts/auto-dpp.prompt.ts` | "Taught X today" → 10-question practice set. Published only if the answer check passes. |

The workflow `POST /api/workflows/create-exam` runs: `resolve_teacher_context → extract_intent → create_exam → generate_and_attach_questions → audit_question_batch`. Runs are stored in Firestore (`workflow_runs`) and executed inside the SSE request (`GET /api/workflows/runs/:runId/events`), so they work on Cloud Functions. New events: `intent_extracted`, `needs_input`.

### 1.2 MCP server

A standard **Model Context Protocol** server (Streamable HTTP, stateless) at **`{api}/mcp`**, built with `@modelcontextprotocol/sdk`. Code: `functions/src/modules/mcp/mcpServer.ts`, `mcpPrompts.ts`, `examOptions.ts`. Every tool calls the same tested functions as the REST API.

**Tools (10)**

| Tool | What it does | Uses Gemini |
|---|---|---|
| `list_my_batches` | Teacher's batches and subjects | – |
| `create_batch` | Create a new batch (name, class, target exam, subject, students) | – |
| `get_exam_options` | Choices for the guided flow: batches, subjects, NCERT topics, counts, difficulty, patterns, marking | – |
| `understand_exam_request` | Sentence → understood settings + exam plan, or what is missing. Creates nothing | ✓ |
| `create_ai_exam` | Create a draft exam with AI questions + blind answer check. Takes a sentence **or** structured fields | ✓ |
| `list_my_exams` | Teacher's exams, newest first (filters: status, batch, subject) | – |
| `review_exam` | One exam: questions, options, correct answer, explanation, answer-check flags | – |
| `publish_exam` | Publish a draft. Token and hash are looked up server-side; refuses flagged exams unless `acknowledgeFlags` | – |
| `create_daily_practice` | Practice set from what was taught | ✓ |
| `create_exam_from_questions` | Exam from ready-made questions (`{ examParams, questions }`) | – |

**Prompts (5)**, shown by clients as a pick list (usually under `/`). All arguments are optional because some clients (Antigravity) open prompts without a form.

| Prompt | Behaviour |
|---|---|
| `show_my_batches` | List batches as a table |
| `create_exam` | Step by step: batch (or create new) → topic (subject comes from the batch) → questions & difficulty → date & time → duration → marking. A full sentence at any step skips what it already answers. |
| `understand_exam_request` | Check a one-sentence request; creates nothing until the teacher says yes |
| `review_exam` | Lists the teacher's exams and asks which one, then shows it |
| `publish_exam` | Lists drafts, shows the answer check, asks to confirm, then publishes |

**Behaviour built into the server's instructions**

- Ask one question at a time; offer real options; never invent presets or assume a batch or topic.
- Speak to a teacher: never show tokens, hashes, raw timestamps or internal IDs.
- Never publish without the teacher's explicit approval.

### 1.3 Auth and fixes

- **Login** (`functions/src/auth/middleware.ts`): deployed functions accept **only the exact `DEMO_AUTH_TOKEN` secret** (timing-safe). If the secret is missing, every request is rejected (fail closed). `mock-token-<teacherId>` and the built-in local token work only in the emulator.
- **Firestore:** `ignoreUndefinedProperties` enabled. Without it, publishing crashed on optional fields.
- **Dates:** "Monday, 22 November 2026" is understood; a weekday that does not match the date returns a question.

### 1.4 Tests

`functions/test/` has 122 Vitest tests (provider, checks, generation, audit, intent, schedule, planner, create-complete, auth, MCP guided flow, exam selection). Run with `cd functions && npm test`.

---

## 2. Configuration

| Name | Where | Required | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | Secret Manager | **Yes** | Server Gemini key. Best created in project `abhyas-unify` (same billing). A free key allows ~20 requests/day/model; one AI exam uses 6–10. |
| `DEMO_AUTH_TOKEN` | Secret Manager | **Yes** | Login for API + MCP. The web app sends `examApi.demoToken` from `src/environments/environment*.ts`; they must match. |
| `GEMINI_MODEL` | `functions/.env` (optional) | No | Default in code: `gemini-3.8-flash`. |
| `GEMINI_AUDIT_MODEL` | `functions/.env` (optional) | No | Separate model for the answer check. |
| `ALLOW_MOCK_TOKENS` | env (optional) | No | `true` enables `mock-token-*` outside the emulator. Leave unset in production. |

**Never** put `GEMINI_API_KEY` or `DEMO_AUTH_TOKEN` in `functions/.env` (deploy fails when a name is both a secret and an env var, and the file is committed). `functions/.env.example` is out of date for this project (`DEMO_TOKEN`, `us-central1`, `ai-kaksha-poc`).

---

## 3. Local development

1. Create `functions/.secret.local` (git-ignored):
   ```
   GEMINI_API_KEY=<your key>
   DEMO_AUTH_TOKEN=demo-teacher-token-alpha
   ```
   Optionally `functions/.env.local` (git-ignored): `GEMINI_MODEL=gemini-2.5-flash`.
2. Build and start the emulators from the repo root:
   ```bash
   cd functions && npm install --legacy-peer-deps && npm run build && cd ..
   npx firebase-tools emulators:start --only functions,firestore --project abhyas-unify
   ```
   Add `--import=./emulator-data --export-on-exit` to keep data between restarts.
3. Local URLs:
   - API: `http://127.0.0.1:5001/abhyas-unify/asia-south1/api`
   - MCP: `http://127.0.0.1:5001/abhyas-unify/asia-south1/api/mcp`
   - Emulator UI: `http://127.0.0.1:9100`
4. Tokens that work locally: the `DEMO_AUTH_TOKEN` value, or `mock-token-teacher-sharma-101`.

---

## 4. Deployment

### 4.1 Before you start

- [ ] Owner/Editor access to Firebase project `abhyas-unify`
- [ ] Project on the **Blaze** plan (Functions and Secret Manager need it), with a budget alert
- [ ] Firestore database exists (it does)
- [ ] Node.js 22, Git
- [ ] The Gemini key, received privately (never through chat or git)

No service-account key file is needed; the CLI login is enough.

### 4.2 Steps

```bash
git clone https://github.com/Unify-India/aikaksha-hackathon.git
cd aikaksha-hackathon            # branch: main

cd functions
npm install --legacy-peer-deps
npm run build
npm test                         # expect all tests passing
cd ..

npx firebase-tools login
npx firebase-tools use abhyas-unify

# Secrets (each command asks for the value)
npx firebase-tools functions:secrets:set GEMINI_API_KEY --project abhyas-unify
npx firebase-tools functions:secrets:set DEMO_AUTH_TOKEN --project abhyas-unify

# Backend: functions + Firestore rules and indexes
npx firebase-tools deploy --only functions,firestore --project abhyas-unify
```

The first deploy takes ~5 minutes and enables the required Google Cloud APIs; answer **Yes** to prompts. Always pass `--only`: a plain `firebase deploy` also tries Realtime Database rules, which this project does not use.

Optional, web app (Hosting):

```bash
npm install
npx ng build --configuration production
npx firebase-tools deploy --only hosting --project abhyas-unify
```

To change a secret later: set it again, then redeploy functions.

### 4.3 Verify

| Check | How | Expected |
|---|---|---|
| API up | `curl https://asia-south1-abhyas-unify.cloudfunctions.net/api/health` | `{"status":"healthy",…}` |
| Login enforced | `curl -X POST https://asia-south1-abhyas-unify.cloudfunctions.net/api/mcp` | HTTP `401` |
| MCP works | `npx @modelcontextprotocol/inspector` → Streamable HTTP → MCP URL + header `Authorization: Bearer <DEMO_AUTH_TOKEN>` → List Tools | 10 tools, 5 prompts |
| Firestore | Inspector → run `list_my_batches` | Batch "Lakshya 2026" |

Logs: `npx firebase-tools functions:log --only api --project abhyas-unify`. The first request after idle takes 5–10 s (cold start).

---

## 5. Connecting AI clients

| What | URL |
|---|---|
| API base | `https://asia-south1-abhyas-unify.cloudfunctions.net/api` |
| MCP server | `https://asia-south1-abhyas-unify.cloudfunctions.net/api/mcp` |
| Web app (if Hosting deployed) | `https://abhyas-unify.web.app` |

| Client | Setup |
|---|---|
| Gemini app (gemini.google.com) | Settings → Connected apps → Add custom app → `https://asia-south1-abhyas-unify.cloudfunctions.net/api/mcp?token=<DEMO_AUTH_TOKEN>` (the app cannot send headers; the server accepts `?token=`). Requires `https://`, so only the deployed URL works. If the app asks for OAuth, that still has to be built. |
| Antigravity | Agent panel → MCP servers → URL + header `Authorization: Bearer <DEMO_AUTH_TOKEN>` |
| Gemini CLI | `gemini mcp add --scope user --transport http --timeout 180000 -H "Authorization: Bearer <DEMO_AUTH_TOKEN>" aikaksha https://asia-south1-abhyas-unify.cloudfunctions.net/api/mcp` |
| Claude Code | `claude mcp add --transport http aikaksha https://asia-south1-abhyas-unify.cloudfunctions.net/api/mcp --header "Authorization: Bearer <DEMO_AUTH_TOKEN>"` |
| MCP Inspector | Streamable HTTP, MCP URL, header `Authorization: Bearer <DEMO_AUTH_TOKEN>` |

Creating an exam takes 1–2 minutes; set client timeouts to ≥180 s where possible. Anyone with the token can create exams and spend Gemini quota: share it only with the team and change it after the hackathon.

---

## 6. Known gaps

- `evaluateSubjectiveAnswer` does not declare the `GEMINI_API_KEY` secret, so it cannot call Gemini when deployed.
- The old `mcpGateway` (`/v1/tools`) expects Firebase ID tokens, not the demo token. Use `/api/mcp`.
- `/api/exams/create-complete` uses `createAndSegregateExam` (from `main`); the MCP tool `create_exam_from_questions` uses `createCompleteExam`. These should be merged into one implementation.
- Voice Copilot live voice needs a browser-side Gemini key; only ship it with a key restricted to the site's domain.
- The Gemini app's custom MCP connection may require OAuth; not built yet.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deploy: secret not found | Secrets not set | Set both secrets, redeploy |
| Deploy: billing / API errors | Not on Blaze | Upgrade, redeploy |
| Every request 401 | `DEMO_AUTH_TOKEN` missing or client sends another value | Check the secret and the client header / `?token=` |
| "Usage limit" / quota errors | Gemini free-tier daily limit | Enable billing on the key's project, or wait for the reset |
| `needs_more_details` reply | A required setting is missing or a date/weekday clash | Answer the question the tool returns |
| First call slow | Cold start | Call `/api/health` a minute before the demo |
