# Skill: Architecture Review

## Goal
Review proposed changes for correctness, security, delivery risk, and future integration.

## Procedure
1. Read current architecture and accepted decisions.
2. Identify actors, trust boundaries, data flows, external providers, failure modes, and sensitive data.
3. Check tenant isolation, authentication, authorization, idempotency, observability, and rollback.
4. Assess whether Abhyas can be reused without coupling the POC to Angular UI internals.
5. Assess Gemini mobile client compatibility separately from MCP server correctness.
6. Evaluate cost and quota failure modes.
7. Produce options, recommendation, trade-offs, migration/rollback, tests, and affected files.

## Approval gate
Any change to identity, tenant boundaries, data model, public tool contracts, provider choice, or deployment permissions requires human review.
