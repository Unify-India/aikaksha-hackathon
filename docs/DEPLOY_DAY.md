# Deploy-Day Cheat Sheet (Hitesh)

Run these in order from the repo root. Everything above the line is already verified; everything below it has **not yet been run** and is written from the current code and Firebase docs.

## Already verified (no cloud needed)
- `cd functions && npm test` -> 17 tests pass (also under TZ=UTC, America/Los_Angeles, Asia/Kolkata, Pacific/Auckland).
- `cd functions && npm run build` -> compiles cleanly.
- `npx ng build` then `firebase emulators:start --only hosting --project abhyas-unify` -> site served on http://127.0.0.1:5050, every route returns the app (SPA rewrite works).
- Firestore `(default)` exists in `abhyas-unify` (asia-south1). Rules deployed.

## Blockers to clear first (ask Sandeep)
1. **Project**: `.firebaserc` says `ai-kaksha-poc`; we have access to `abhyas-unify`. Agree one, update `.firebaserc`.
2. **Blaze plan** on that project (Cloud Functions + Secret Manager need billing).
3. **Gemini API key**, sent privately.
4. **Secret wiring**: code reads `process.env.GEMINI_API_KEY`. For deployed v1 functions it must be declared, e.g. `.runWith({ timeoutSeconds: 300, memory: '1GB', secrets: ['GEMINI_API_KEY'] })` in `functions/src/index.ts` (Sandeep owns that file).

---

## Steps (not yet run)

```bash
# 0. Pre-flight
cd functions && npm test && npm run build && cd ..

# 1. Store the key (prompts for the value; never commit it)
firebase functions:secrets:set GEMINI_API_KEY --project abhyas-unify

# 2. Deploy the backend
firebase deploy --only functions --project abhyas-unify

# 3. Check it is alive (note the function is named "api" and Express also mounts /api/...)
curl https://us-central1-abhyas-unify.cloudfunctions.net/api/health

# 4. Give Paritosh the base URL for src/environments/environment.prod.ts
#    (UI guide: <function url>/api  ->  .../api/api/...)

# 5. Build and deploy the website
npm run build
firebase deploy --only hosting --project abhyas-unify
#    site: https://abhyas-unify.web.app

# 6. Smoke test against the live URLs (scripts/e2e-smoke-test.sh — to be written)
```

## If something breaks
- Backend logs: `firebase functions:log --project abhyas-unify`
- Bad site deploy: Firebase console -> Hosting -> previous release -> Rollback.
- Bad rules deploy: redeploy the previous `firestore.rules` from git.
- Demo fallback: the Angular app has a mock mode (`environment.mcp.mode = 'mock'`).

## Gotchas already found
- macOS uses port 5000 for AirPlay, so the hosting emulator is set to 5050.
- Functions run in `us-central1`; Firestore is in `asia-south1` (a little cross-region latency; fine for a demo).
- `~/.npm` has root-owned files from an earlier `sudo`; use `--cache <tmpdir>` or `sudo chown -R $USER ~/.npm`.
- Never run `firebase` or `gcloud` with `sudo`.
