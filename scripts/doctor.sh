#!/usr/bin/env bash
set -u

check() {
  local name="$1"
  shift
  if command -v "$1" >/dev/null 2>&1; then
    printf "[OK] %-18s %s\n" "$name" "$("$@" 2>&1 | head -n 1)"
  else
    printf "[MISSING] %s\n" "$name"
  fi
}

echo "AI Kaksha environment doctor"
echo "OS: $(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}" || uname -s)"
check "git" git --version
check "node" node --version
check "npm" npm --version
check "pnpm" pnpm --version
check "yarn" yarn --version
check "gcloud" gcloud --version
check "docker" docker --version
check "python3" python3 --version
check "jq" jq --version

echo
echo "Repository:"
git rev-parse --show-toplevel 2>/dev/null || echo "[INFO] Current directory is not inside a Git repository."
git status --short --branch 2>/dev/null || true

echo
echo "Checks are informational. Missing optional tools are not necessarily blockers."
