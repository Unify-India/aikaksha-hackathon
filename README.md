# AI Kaksha Antigravity Engineering Kit

Repository-ready starter kit for the AI Kaksha hackathon POC.

## 🌐 Live Deployments

| Component | Target URL |
| :--- | :--- |
| **Web Application (Production)** | [https://abhyas-unify.web.app](https://abhyas-unify.web.app) |
| **Web Application (Firebase App)** | [https://abhyas-unify.firebaseapp.com](https://abhyas-unify.firebaseapp.com) |
| **Backend REST & SSE API** | `https://asia-south1-abhyas-unify.cloudfunctions.net/api` |
| **Model Context Protocol (MCP) Server** | `https://asia-south1-abhyas-unify.cloudfunctions.net/api/mcp` |
| **API Health Check** | [https://asia-south1-abhyas-unify.cloudfunctions.net/api/health](https://asia-south1-abhyas-unify.cloudfunctions.net/api/health) |
| **GCP / Firebase Project** | `abhyas-unify` (Region: `asia-south1` / Mumbai) |

---

## What this kit does

- Establishes project context and engineering guardrails for Antigravity agents.
- Defines specialist skills and repeatable workflows.
- Provides Ubuntu setup and environment-check scripts.
- Defines the intended MCP, exam-generation, and subjective-evaluation boundaries.
- Separates confirmed product requirements from assumptions requiring source inspection.

## Important integration gate: Gemini mobile

A remote MCP server being standards-compliant does **not** guarantee that the consumer Gemini mobile app can connect to it. Before treating Gemini mobile as the production/demo client, verify the exact app version, account eligibility, custom MCP/extension support, remote transport support, and OAuth requirements.

Until verified, use a compatible MCP inspector or another supported MCP host to validate the server. Do not silently substitute Gemini CLI and claim that Gemini mobile is integrated. If direct Gemini mobile connectivity is unavailable, the fallback is a small authenticated AI Kaksha client using Gemini APIs and the same backend tool/service layer.

## Repository layout

```text
AGENTS.md
GEMINI.md
.agent/
  rules/
  skills/
  workflows/
docs/
  PRODUCT_SCOPE.md
  SYSTEM_ARCHITECTURE.md
  SECURITY_MODEL.md
  API_CONTRACTS.md
  ABHYAS_VOICE_EXAM_SPEC.md
  DATA_MODEL.md
  DECISIONS.md
  REPOSITORY_INSPECTION.md
  EIGHT_HOUR_PLAN.md
scripts/
  ubuntu-bootstrap.sh
  doctor.sh
  validate-env.sh
  gcp-preflight.sh
.env.example
.gitignore
```

## Install into the POC repository

1. Extract/copy the kit contents into the root of the **new POC repository**.
2. Keep the Abhyas repository separate and read-only during discovery.
3. Open the POC root in Antigravity.
4. Ask the Project Discovery skill to inspect both repositories before coding.
5. Complete `docs/REPOSITORY_INSPECTION.md`.
6. Review and approve `docs/DECISIONS.md` before implementation.

## Ubuntu quick start

```bash
chmod +x scripts/*.sh
./scripts/ubuntu-bootstrap.sh
cp .env.example .env
./scripts/doctor.sh
./scripts/validate-env.sh
```

The bootstrap script installs local development tools only where practical. It does not create cloud resources, change IAM, enable APIs, or deploy anything.

## Secrets

- Never commit `.env`, service-account JSON, OAuth client secrets, Firebase Admin credentials, or API keys.
- Use local `.env` only for development.
- Use Google Secret Manager or an equivalent managed secret store for deployed workloads.
- Prefer Application Default Credentials for local Google Cloud development where appropriate.
- Never put privileged credentials in the browser, Gemini prompt, MCP tool output, or student-facing client.

## Agent operating model

- Agents may inspect, edit, build, test, lint, and run local services within the workspace.
- Agents should not ask for routine permission for reversible local engineering actions.
- Architecture, identity/security, schema, public API, cost, and deployment changes require a concise proposal and human review.
- Production deployment, destructive cloud operations, IAM grants, real student notifications, exam publication, and final high-stakes grade publication require explicit human approval.
- Never bypass host-level safety controls or permission prompts.

## Runtime policy

The Abhyas dossier describes an existing Node 20 backend. Do not upgrade or alter Abhyas runtime during the hackathon without inspection and approval. For a standalone new Cloud Run MCP service, use a currently supported Node LTS runtime after checking the current Cloud Run runtime matrix. The kit does not pin an Abhyas runtime.

## First Antigravity task

Use this prompt:

> Read `AGENTS.md`, `GEMINI.md`, all `.agent/rules/`, and `docs/REPOSITORY_INSPECTION.md`. Do not implement features yet. Inspect this POC repository and the separately located Abhyas repository. Produce a repository map, identify exact reusable exam/question-bank/authentication/storage services, report runtime and package-manager versions, map the current exam creation and assignment lifecycle, and fill `docs/REPOSITORY_INSPECTION.md` with file paths and evidence. Do not modify Abhyas. Do not guess schemas. List blockers and the smallest set of human decisions required.

## Source-grounding

The supplied AI Kaksha product overview and hackathon dossier describe the product direction and claimed Abhyas capabilities. They are not a substitute for inspecting the actual repositories. Every integration point in this kit that depends on source code is explicitly marked `INSPECT`.


## Abhyas voice-exam specification update

The kit now includes the supplied Abhyas Autonomous Voice & Agent Workflow specification as `docs/ABHYAS_VOICE_EXAM_SPEC.md`, with the four proposed tools, exam parameter contract, question schema, Gemini generation inputs, answer-key partition, guardrails and acceptance tests. `docs/API_CONTRACTS.md`, `docs/DATA_MODEL.md`, the exam-workflow skill and the dedicated build workflow have been aligned to it.

**Still requires repository inspection:** exact Abhyas paths/schemas, Firestore vs RTDB, callable service entry points, teacher/tenant authorization, actual question option IDs, time-zone behavior, Firebase rules and credential storage. The spec is a requirements contract, not proof those implementations exist. Do not code guessed adapters or write to proposed collections before completing `docs/REPOSITORY_INSPECTION.md`.
