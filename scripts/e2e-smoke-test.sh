#!/usr/bin/env bash
# AI Kaksha end-to-end smoke test.
#
# Usage:
#   scripts/e2e-smoke-test.sh                      # against the local Firebase emulator
#   scripts/e2e-smoke-test.sh <BASE_URL> [TOKEN]   # against a deployed API
#
#   BASE_URL is the URL of the "api" function (no trailing slash), e.g.
#     http://127.0.0.1:5001/demo-ai-kaksha/us-central1/api
#     https://us-central1-abhyas-unify.cloudfunctions.net/api
#   TOKEN defaults to the demo token.
#
# Optional env vars:
#   FIRESTORE_EMULATOR_HOST  e.g. 127.0.0.1:8000. When set, the script seeds a published
#                            exam WITH an answer key straight into the emulator so it can
#                            prove the student endpoint strips answers.
#   EMU_PROJECT              emulator project id (default demo-ai-kaksha)
#   PUBLISHED_EXAM_ID        id of an already-published exam to run the strip check on
#                            (use this against a deployed API).
#
# Exit code is non-zero if any check FAILS. Checks that need a live Gemini key are SKIPPED
# and reported as such (a skip is never reported as a pass).
set -u

BASE="${1:-http://127.0.0.1:5001/demo-ai-kaksha/us-central1/api}"
TOKEN="${2:-demo-teacher-token-alpha}"
EMU_PROJECT="${EMU_PROJECT:-demo-ai-kaksha}"
JSON='Content-Type: application/json'
AUTH="Authorization: Bearer ${TOKEN}"

PASS=0; FAIL=0; SKIP=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  \033[31mFAIL\033[0m  %s\n        %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }
skip() { printf '  \033[33mSKIP\033[0m  %s\n        %s\n' "$1" "${2:-}"; SKIP=$((SKIP+1)); }

# http <method> <path> [curl args...]  -> sets CODE and BODY
http() {
  local method="$1" path="$2"; shift 2
  local out
  out=$(curl -s -m 30 -X "$method" -w $'\n%{http_code}' "$BASE$path" "$@") || out=$'\n000'
  CODE="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}
jget() { python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    for k in sys.argv[1].split('.'): d=d[k]
    print(d)
except Exception: print('')" "$1"; }
expect_code() { # name expected
  if [ "$CODE" = "$2" ]; then pass "$1 (HTTP $CODE)"; else fail "$1" "expected HTTP $2, got $CODE: ${BODY:0:200}"; fi
}

echo "AI Kaksha smoke test"
echo "  API:   $BASE"
echo

echo "[1] Service and authentication"
http GET /health
expect_code "health endpoint answers" 200

http POST /api/tools/resolve_teacher_context -H "$JSON" -d '{}'
expect_code "no token is rejected" 401

# NOTE: today the server accepts ANY token starting with "demo-". Use a token that does not.
http POST /api/tools/resolve_teacher_context -H "$JSON" -H "Authorization: Bearer not-a-valid-token" -d '{}'
expect_code "invalid token is rejected" 401

http POST /api/tools/resolve_teacher_context -H "$JSON" -H "$AUTH" -d '{}'
expect_code "valid token is accepted" 200
if echo "$BODY" | grep -q "batch-lakshya-2026"; then pass "seeded demo batch is present"; else fail "seeded demo batch is present" "${BODY:0:200}"; fi

echo
echo "[2] Submission window (server clock)"
now_ms=$(python3 -c "import time;print(int(time.time()*1000))")
mk_exam() { # title start end -> prints examId
  curl -s -m 30 -X POST "$BASE/api/tools/create_exam" -H "$JSON" -H "$AUTH" \
    -d "{\"title\":\"$1\",\"batchId\":\"batch-lakshya-2026\",\"duration\":45,\"targetQuestions\":15,\"defaultMarks\":4,\"startTimestampMs\":$2,\"endTimestampMs\":$3,\"languages\":[\"en\"]}" \
    | jget examId
}
past_id=$(mk_exam "Smoke closed exam" $((now_ms-7200000)) $((now_ms-3600000)))
live_id=$(mk_exam "Smoke open exam" $((now_ms-600000)) $((now_ms+3600000)))
if [ -z "$past_id" ] || [ -z "$live_id" ]; then
  fail "create test exams" "create_exam returned no examId (past='$past_id' live='$live_id')"
else
  http POST "/api/student/exams/$past_id/submit" -H "$JSON" -d '{"studentId":"smoke-student","responses":{}}'
  expect_code "late submission is rejected" 403
  if echo "$BODY" | grep -q WINDOW_CLOSED; then pass "late submission reports WINDOW_CLOSED"; else fail "late submission reports WINDOW_CLOSED" "${BODY:0:200}"; fi

  http POST "/api/student/exams/$live_id/submit" -H "$JSON" -d '{"studentId":"smoke-student","responses":{}}'
  expect_code "on-time submission is accepted" 200

  http GET "/api/student/exams/$live_id"
  expect_code "student cannot open an unpublished (draft) exam" 403
fi
http GET /api/student/exams/does-not-exist-smoke
expect_code "unknown exam returns 404" 404

echo
echo "[3] Students never receive the answer key"
check_stripped() { # examId
  http GET "/api/student/exams/$1"
  if [ "$CODE" != "200" ]; then fail "student view of exam $1" "expected HTTP 200, got $CODE: ${BODY:0:200}"; return; fi
  pass "student view of published exam loads (HTTP 200)"
  local leaks=""
  for k in correctOptionId '"answer"' explanation; do echo "$BODY" | grep -q "$k" && leaks="$leaks $k"; done
  if [ -z "$leaks" ]; then pass "student response contains no correctOptionId / answer / explanation"
  else fail "student response leaks answer fields" "found:$leaks"; fi
  if echo "$BODY" | grep -q '"answerKeyIncluded":false'; then pass "response states answerKeyIncluded=false"; else fail "answerKeyIncluded flag" "missing"; fi
}
if [ -n "${PUBLISHED_EXAM_ID:-}" ]; then
  check_stripped "$PUBLISHED_EXAM_ID"
elif [ -n "${FIRESTORE_EMULATOR_HOST:-}" ]; then
  pub_id="smoke_published_$now_ms"
  seed=$(python3 - "$FIRESTORE_EMULATOR_HOST" "$EMU_PROJECT" "$pub_id" "$now_ms" <<'PY'
import json, sys, urllib.request
host, project, exam_id, now = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
def enc(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [enc(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: enc(x) for k, x in v.items()}}}
    return {"nullValue": None}
def put(coll, doc_id, data):
    url = f"http://{host}/v1/projects/{project}/databases/(default)/documents/{coll}/{doc_id}"
    req = urllib.request.Request(url, method="PATCH", data=json.dumps({"fields": {k: enc(v) for k, v in data.items()}}).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer owner"})
    urllib.request.urlopen(req, timeout=10).read()
put("master_exams", exam_id, {"id": exam_id, "title": "Smoke published", "subject": "Physics", "class": "Class 12", "duration": 45,
    "totalMarks": 4, "status": "upcoming", "teacherId": "teacher-sharma-101", "defaultMarks": 4, "defaultNegativeMarks": 1,
    "startTimestampMs": now + 3600000, "endTimestampMs": now + 7200000})
put("exam_questions", exam_id, {"questions": [{"id": "q1", "type": "MCQ", "marks": 4, "subject": "Physics",
    "en": {"text": "Smoke question?", "options": [{"id": "opt1", "text": "A"}, {"id": "opt2", "text": "B"}]},
    "correctOptionId": "opt2", "answer": "SECRET-ANSWER", "explanation": {"en": "SECRET-EXPLANATION"}}]})
print("ok")
PY
  )
  if [ "$seed" = "ok" ]; then
    check_stripped "$pub_id"
    if echo "$BODY" | grep -q "SECRET-"; then fail "seeded secret strings reached the student" "SECRET- found in response"; else pass "seeded secret strings did not reach the student"; fi
  else
    fail "seed published exam into emulator" "could not write to $FIRESTORE_EMULATOR_HOST"
  fi
else
  skip "answer-key stripping on a published exam" "set FIRESTORE_EMULATOR_HOST (local) or PUBLISHED_EXAM_ID (deployed) to run this check"
fi

echo
echo "[4] Publish confirmation (needs live Gemini)"
skip "second publish returns 409 IDEMPOTENCY_CONFLICT" "needs the full generate->audit->publish flow, which requires a Gemini API key"

echo
echo "Summary: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
