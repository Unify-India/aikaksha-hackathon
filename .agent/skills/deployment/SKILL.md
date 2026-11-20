# Skill: Deployment Engineering

## Goal
Prepare reproducible deployment to Google Cloud Run or the verified existing hosting target.

## Procedure
1. Inspect current runtime and choose a supported Cloud Run runtime.
2. Build a minimal container or supported source deployment.
3. Configure service identity with least privilege.
4. Store secrets in Secret Manager.
5. Set region, concurrency, memory, CPU, timeout, min/max instances and ingress deliberately.
6. Configure health/readiness endpoints and structured logs.
7. Verify auth, CORS, TLS, rate limits and quotas.
8. Deploy to a non-production service first.
9. Run smoke tests and rollback plan.
10. Report URL, revision, config and cost risks.

## Approval
Deployment to production, IAM changes, API enablement, resource creation with material cost, or changes to live student workflows require explicit approval.
