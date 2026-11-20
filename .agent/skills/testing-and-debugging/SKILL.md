# Skill: Testing and Debugging

## Procedure
1. Reproduce issue and capture exact command/error.
2. Identify whether failure is environment, dependency, code, provider, quota, auth, or integration.
3. Create/adjust a focused test.
4. Fix the root cause, not only the symptom.
5. Run focused test, then full relevant test suite, typecheck, lint and build.
6. Check regression and security boundary.
7. Report executed commands and results accurately.

## Constraints
- No fake passing tests.
- No deleting tests to make CI green.
- No disabling auth or validation as a workaround.
- No unbounded retry loops.
- Do not print tokens, private keys, student submissions, or full sensitive payloads.
