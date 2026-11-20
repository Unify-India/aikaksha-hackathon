# AI Kaksha — Backend, Firebase & MCP Architecture Specification

> **Status**: Comprehensive Analysis & Implementation Blueprint  
> **Target Scope**: Cloud Functions for Firebase (Node 22 / TypeScript), Firestore 3-Way Partitioning, GCS/Storage Security, SSE Streaming vs Real MCP Protocol, Cryptographic Publish Gates.

---

## Executive Summary & System Overview

AI Kaksha is an education operations platform designed to drastically reduce teacher prep and assessment burden. The backend architecture bridges two interfaces:
1. **Model/Agent Interface**: MCP (Model Context Protocol) and Gemini multimodal AI agents capable of resolving context, drafting questions, performing automated solver/pedagogical audits, and evaluating handwritten answer sheets.
2. **Teacher & Student Web Interface**: High-performance Angular 22 frontend utilizing real-time SSE streaming for live pipeline telemetry, KaTeX question rendering, review gate verification, and non-destructive SVG red-pen overlays.

---

## 1. MCP Server & Gemini Connector Architecture

### 1.1 Dual-Interface Strategy (Remote MCP vs. Application Web Client)
- **Gemini Mobile / Remote MCP Constraint**: As identified in project guidelines, consumer Gemini mobile clients do not yet support arbitrary custom remote MCP servers without dedicated host authorization.
- **Architectural Solution**: AI Kaksha provides a dual-model access boundary:
  - **Standard MCP Protocol Gateway** (`/mcp`): Implements `@modelcontextprotocol/sdk` over Server-Sent Events (`SSEServerTransport`) for standard MCP clients (Antigravity CLI, Vertex AI Agent MCP connectors).
  - **Direct REST & SSE Orchestration Gateway** (`/api/workflows/*`, `/api/tools/*`): Optimized for the Angular frontend, providing low-latency execution and live event streaming.

### 1.2 MCP Tool Catalog & Signatures
The backend exposes 6 core tools implementing server-side validation, idempotency, and tenant containment:

| Tool | Purpose | Primary Inputs | Core Output / Behavior |
| :--- | :--- | :--- | :--- |
| `resolve_teacher_context` | Resolves teacher identity, authorized batches, recent exams, and subject catalog | None (derived from auth token) | `{ teacherId, tenantId, batches: IBatch[], subjects: string[] }` |
| `create_exam` | Validates schedule, marking rules, and duration; initializes master draft | `{ title, subject, duration, batchId, targetQuestions, defaultMarks, defaultNegativeMarks }` | `{ examId, status: 'draft', exam: IExam }` |
| `generate_and_attach_questions` | Calls Gemini 2.5 Flash to generate questions; saves to `draft_questions` subcollection; enforces idempotency via `requestId` | `{ examId, subject, topic, count, difficulty, requestId }` | `{ examId, generatedCount, questions: sanitized[] }` (Answers withheld from student preview) |
| `audit_question_batch` | Automated solver pass and LaTeX validation; computes canonical SHA-256 hash; issues single-use confirmation token | `{ examId }` | `{ examId, score: 100, passed: true, contentHash, confirmationToken }` |
| `finalize_and_publish_exam` | Verified Human-in-the-loop publish gate; atomically partitions data into 3 collections | `{ examId, confirmationToken, contentHash, status }` | `{ success: true, examId, status: 'upcoming', publishedAt }` |
| `create_auto_dpp` | Autonomous Daily Practice Problem creation pipeline chaining context, draft, generation, audit, and publishing | `{ topic, batchId, subject, count, requestId }` | `{ examId, title, topic, status: 'upcoming', contentHash }` |

### 1.3 Gemini Provider Integration (`functions/src/providers/gemini.provider.ts`)
- **SDK**: `@google/genai` (v3.6.1+) with singleton client instantiation.
- **Model Target**: `gemini-2.5-flash` with structured JSON output enforcement (`responseMimeType: 'application/json'`, `responseSchema`).
- **Resilience**: Exponential backoff with random jitter handling HTTP 429 (`RESOURCE_EXHAUSTED`) and 5xx errors up to 3 retry attempts.
- **Thinking Budget**: Allocates 1,536 thinking tokens for complex multi-step reasoning (e.g. physics equation validation and handwritten mathematical derivation tracking).

---

## 2. Firestore Schema & 3-Way Partition Boundaries

To guarantee that answer keys and explanations cannot leak to students under any circumstances, the backend enforces a physical **3-way partition**:

```
+-----------------------------------------------------------------------------------+
|                               FIRESTORE ROOT                                      |
+-----------------------------------------------------------------------------------+
       |                                      |                                |
       v                                      v                                v
+--------------------------+  +-------------------------------+  +--------------------------+
|  master_exams/{examId}   |  |   exam_questions/{examId}     |  |    answerKey/{examId}    |
|--------------------------|  |-------------------------------|  |--------------------------|
| - title, duration, class |  | - examId                      |  | - examId                 |
| - subject, timestamps    |  | - questions: Array<           |  | - teacherId              |
| - totalMarks, totalQ     |  |     IExamQuestionWithoutAns   |  | - keys: {                |
| - status ('draft'/'live')|  |   >                           |  |     qId: { correctOption,|
| - draftHash, teacherId   |  | * Strictly NO correctOptionId |  |           explanation,   |
| * questions array: []    |  | * Strictly NO explanation     |  |           marks, negMarks|
| * NO answers stored here |  | * Safe for student read       |  |   } }                    |
|--------------------------|  |-------------------------------|  |--------------------------|
| Read: Authenticated      |  | Read: Authenticated           |  | Read: Teacher/Admin ONLY |
| Write: Teacher/Admin     |  | Write: Teacher/Admin          |  | (Or student when past)   |
+--------------------------+  +-------------------------------+  +--------------------------+
```

### 2.1 Partition Details
1. **`master_exams/{examId}`**:
   - Holds high-level metadata, schedule locks (`startTimestampMs`, `endTimestampMs`), status, and audit verification hashes (`draftHash`).
   - **Crucial Rule**: The `questions` array is explicitly cleared/omitted upon publish. Even if a student inspects metadata queries, zero question text or answers exist in this document.
2. **`exam_questions/{examId}`**:
   - Contains questions with options, text, and LaTeX equations.
   - All sensitive fields (`correctOptionId`, `answer`, `explanation`) are stripped via `stripForStudent()`.
   - Readable by authenticated students during active exam windows.
3. **`answerKey/{examId}`**:
   - Contains the authoritative answer key, rubric criteria, and step-by-step explanations.
   - Enforced by `firestore.rules` (lines 77–87): Read is restricted strictly to teachers and admins. Students can only read after the exam status transitions to `'past'` or `'open'`.
4. **Draft Staging (`master_exams/{examId}/draft_questions/{qId}`)**:
   - During generation and review stages, draft questions reside in a subcollection under the master exam doc.
   - Upon teacher approval, a Firestore atomic batch write (`db.batch()`) writes to partitions 1, 2, and 3 simultaneously.

---

## 3. Security, Authentication & Verification Architecture

### 3.1 Bearer Token Auth & Identity Mapping
- **Firebase Admin SDK Verification**: In production, `authenticateRequest` extracts `Authorization: Bearer <token>` and verifies the JWT via `admin.auth().verifyIdToken(idToken)`.
- **Demo / Dev Bypass Handling**: To accommodate offline hackathon evaluation and browser `EventSource` constraints, `authMiddleware` supports `?token=` query parameters and accepts demo tokens (`demo-teacher-token-alpha`, `demo-token`), resolving to synthetic principal:
  ```typescript
  {
    teacherId: 'teacher-sharma-101',
    tenantId: 'institute-alpha-delhi',
    role: 'teacher'
  }
  ```
- **Untrusted Caller Principle**: The backend **never** accepts `teacherId` or `tenantId` from client request bodies or query parameters. The identity is derived strictly from the verified authentication context.

### 3.2 Tenant Isolation & Resource Ownership
Every query and mutation enforces strict teacher and tenant isolation:
```typescript
if (examData.teacherId !== teacherId) {
  throw new Error('Teacher ownership mismatch: unauthorized access to exam draft');
}
```

### 3.3 Cryptographic Draft Verification & Single-Use Token Publish Gate
To prevent prompt injection, race conditions, or unauthorized alterations:
1. **Deterministic Canonical Hashing**:
   - `canonicalJson()` recursively sorts object keys before serialization.
   - `sha256Canonical(strippedQuestions)` produces a deterministic SHA-256 hash (`contentHash`).
2. **Single-Use Confirmation Token**:
   - During the solver audit pass (`audit_question_batch`), the server generates `confirmationToken = 'conf_' + crypto.randomBytes(16).toString('hex')`.
   - The token and expected `draftHash` are saved on `master_exams/{examId}`.
3. **Atomic Publish Gate**:
   - In `finalizeAndPublishExam` / `publishExamWithReviewGate`, the caller must submit `{ examId, confirmationToken, contentHash }`.
   - The server verifies:
     - `currentExam.teacherId === teacherId`
     - `exam.confirmationToken === confirmationToken` (single-use validation)
     - `exam.draftHash === contentHash`
     - Recalculates `sha256Canonical` on current questions to ensure no tampering occurred.
     - Rejects already-published exams with `409 IDEMPOTENCY_CONFLICT`.
     - In the atomic batch, `confirmationToken: null` is written immediately to prevent replay attacks.

---

## 4. Storage Architecture for Student Answer Sheets

### 4.1 Cloud Storage Partition & Bucket Rules (`storage.rules`)
- **Bucket Path**: `answer_sheets/{teacherId}/{submissionId}/{fileName}`
- **Security Constraints**:
  - Max file size: `25 MB`
  - Allowed MIME types: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`
  - Access Control: Only the submitting student, the assigned teacher (`request.auth.uid == teacherId`), or an admin can read the file.
- **Question Media Path**: `questions/{questionId}/{fileName}` (Max 10 MB).

### 4.2 Non-Destructive SVG Overlay Architectural Decision
Earlier architectures contemplated rendering derived annotated PDFs or PNGs on the server using headless canvas libraries and storing them back into Firebase Storage.

**Adopted Optimization (Decoupled Multimodal Vision)**:
1. **Original File Immutability**:
   - The student's uploaded answer sheet is hashed via SHA-256 (`computeSha256Checksum`) upon receipt. The original file is stored in Cloud Storage unmodified.
2. **Gemini 2.5 Flash Vision Analysis**:
   - The base64 file buffer is passed to Gemini with `subjectiveVisionSchema`.
   - Gemini returns structured step scores and normalized `box_2d` coordinates: `[ymin, xmin, ymax, xmax]` on a `0–1000` scale.
3. **Client-Side SVG Annotation Layer**:
   - The Angular frontend overlays a responsive SVG (`<svg viewBox="0 0 1000 1000">`) over the raw answer sheet image.
   - Red-pen bounding boxes, checkmarks, and score badges (`+4/4`) are rendered dynamically.
4. **Key Benefits**:
   - Eliminates complex server-side graphics libraries (`pdf-lib`, `canvas`, `cairo`).
   - Zero storage overhead for derived images.
   - Teachers can adjust marks or drag bounding boxes in real time with instant re-rendering.

---

## 5. SSE Streaming Pipeline vs. Real MCP Protocol Endpoints

### 5.1 Real-Time SSE Pipeline (`/api/workflows/create-exam` & `/runs/:runId/events`)
For the web UI, executing multiple LLM calls synchronously causes gateway timeouts and poor user experience. The asynchronous SSE pipeline solves this:

1. **Job Queueing**:
   - `POST /api/workflows/create-exam` returns HTTP `202 Accepted` with `{ runId: "run_xyz" }` within ~50ms.
2. **Background Execution Loop**:
   - Node background task executes:
     `resolve_teacher_context` $\rightarrow$ `create_exam` $\rightarrow$ `generate_and_attach_questions` $\rightarrow$ `audit_question_batch`.
3. **SSE Event Streaming**:
   - Frontend connects via `EventSource` to `GET /api/workflows/runs/:runId/events?token=...`.
   - Emits structured events:
     - `tool_started`: `{ tool: "create_exam", at: 1711000000 }`
     - `tool_finished`: `{ tool: "create_exam", durationMs: 420, summary: "Draft created" }`
     - `tool_failed`: `{ tool: "generate_and_attach_questions", error: "Rate limit" }`
     - `run_completed`: `{ examId, contentHash, confirmationToken }`
4. **History Replay**:
   - Historical events are cached in memory so clients that connect after the job starts receive full back-telemetry before live events stream.

### 5.2 Real MCP Protocol Implementation (`/mcp`)
To support external AI agents and standard MCP clients:
- **Specification**: `@modelcontextprotocol/sdk` (v1.x).
- **Transport**: `SSEServerTransport` mounted at `/mcp`.
  - `GET /mcp/sse`: Establishes SSE stream and issues session endpoint.
  - `POST /mcp/messages?sessionId=...`: Receives standard JSON-RPC 2.0 requests (`tools/list`, `tools/call`).
- **Bridge Mapping**: The MCP server routes `tools/call` invocations directly to the shared TypeScript functions in `functions/src/modules/exams/examTools.ts`.

---

## 6. Comprehensive Backend Implementation & Action Plan

| Phase | Component | Action Items | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Firestore & Rules** | Verify 3-way partition rules (`master_exams`, `exam_questions`, `answerKey`); add compound indexes for `(teacherId, createdAt desc)`. | **Complete** |
| **Phase 2** | **Core Exam Tools** | Implement `resolveTeacherContext`, `createExam`, `generateAndAttachQuestions`, `auditQuestionBatch`, `finalizeAndPublishExam`. | **Complete** |
| **Phase 3** | **SSE Telemetry** | Deploy `workflowRouter` with background job execution and SSE event streaming at `/api/workflows/create-exam` and `/runs/:runId/events`. | **Complete** |
| **Phase 4** | **Student Safe API** | Deploy `/api/student/exams/:examId` (answers stripped) and `/api/student/exams/:examId/submit` (server clock deadline enforcement). | **Complete** |
| **Phase 5** | **Multimodal Vision** | Deploy `evaluateSubjectiveAnswer` callable + Gemini 2.5 Flash `box_2d` bounding box extraction. | **Complete** |
| **Phase 6** | **Standard MCP SDK** | Mount `@modelcontextprotocol/sdk` with `SSEServerTransport` at `/mcp` alongside current Express tool endpoints. | **Planned Next** |
