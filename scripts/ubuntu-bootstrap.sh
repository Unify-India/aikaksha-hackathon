#!/usr/bin/env bash
set -euo pipefail

echo "AI Kaksha Ubuntu bootstrap"
echo "This script installs local developer tools only. It does not change cloud IAM or create cloud resources."

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script expects Ubuntu/Debian with apt-get. Install tools using your OS package manager."
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl git jq unzip build-essential python3 python3-venv

if ! command -v nvm >/dev/null 2>&1; then
  echo "Installing nvm for the current user..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
else
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

if command -v nvm >/dev/null 2>&1; then
  nvm install --lts
  nvm use --lts
  echo "Installed current Node LTS via nvm."
else
  echo "nvm is not available in this shell. Open a new terminal and run: nvm install --lts"
fi

echo
echo "Optional Google Cloud CLI:"
echo "Install from https://cloud.google.com/sdk/docs/install if not already installed."
echo "Do not run gcloud auth application-default login until using your own authorized account."
echo
echo "Bootstrap complete. Open a new shell if PATH changes are not visible."
