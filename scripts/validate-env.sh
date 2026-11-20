#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env and populate required values."
  exit 1
fi

# Parse only simple KEY=value presence; do not source or print secret values.
required=(NODE_ENV PORT)
optional=(GEMINI_API_KEY GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_LOCATION FIREBASE_PROJECT_ID AUTH_ISSUER AUTH_AUDIENCE)

get_value() {
  local key="$1"
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*(.*)$/\\1/p" "$ENV_FILE" | tail -n 1
}

failed=0
for key in "${required[@]}"; do
  value="$(get_value "$key")"
  if [[ -z "$value" ]]; then
    echo "[MISSING] $key"
    failed=1
  else
    echo "[OK] $key is set"
  fi
done

echo
echo "Optional configuration presence (values are never printed):"
for key in "${optional[@]}"; do
  value="$(get_value "$key")"
  if [[ -n "$value" ]]; then
    echo "[SET] $key"
  else
    echo "[NOT SET] $key"
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo
echo "Presence check complete. This does not validate credentials, scopes, billing, model access, or connectivity."
