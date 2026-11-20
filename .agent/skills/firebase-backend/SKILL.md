# Skill: Firebase and Google Cloud Backend

## Goal
Integrate Firebase/Google Cloud using least privilege and repository-compatible patterns.

## Procedure
1. Inspect existing Firebase project configuration and SDK versions.
2. Identify client SDK vs Admin SDK usage and current auth claims.
3. Inspect Firestore rules, Storage rules, indexes, and Cloud Functions/Run conventions.
4. Reuse existing application services where verified.
5. Keep privileged access server-side.
6. Use ADC locally where appropriate and managed service identity in Cloud Run.
7. Use Secret Manager for deployed secrets.
8. Add emulator/integration tests where practical.
9. Check quotas, billing, region, retention, and logging before deployment.

## Restrictions
No IAM changes, API enablement, resource deletion, or production deployment without explicit approval.
