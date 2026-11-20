# Skill: Project Discovery

## Goal
Map the POC and Abhyas repositories before implementation, without guessing.

## Inputs
- POC repository root.
- Abhyas repository root.
- Product overview and hackathon dossier.

## Procedure
1. Record `pwd`, Git status, branch, remotes (do not print embedded credentials), commit, package manager, runtime and lockfiles.
2. Map top-level directories and relevant modules.
3. Search for exam creation, question bank, question generation, assignment, badge, batch, teacher auth, Firebase rules, Storage, Gemini service, PDF generation and subjective question flows.
4. Trace actual call paths from UI/controller to service to persistence.
5. Identify reusable public/service interfaces versus UI-only logic.
6. Inspect tests and security rules.
7. Record exact paths, symbols, schemas, and evidence in `docs/REPOSITORY_INSPECTION.md`.
8. Mark each item VERIFIED, PARTIAL, NOT FOUND, or NEEDS HUMAN DECISION.

## Constraints
- Do not edit Abhyas.
- Do not assume dossier paths still exist.
- Do not infer Firestore schema from names alone.
- Do not copy code until licensing, dependencies, and coupling are understood.

## Deliverable
A repository map, integration candidates, dependency map, risks, and a list of unanswered questions.
