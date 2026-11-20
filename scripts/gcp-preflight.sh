#!/usr/bin/env bash
set -euo pipefail

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI not found. Install Google Cloud CLI first."
  exit 1
fi

echo "Active gcloud account:"
gcloud auth list --filter=status:ACTIVE --format='value(account)' || true

PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
echo "Configured project: ${PROJECT:-NOT_SET}"

if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "Set the intended project explicitly with: gcloud config set project PROJECT_ID"
  exit 1
fi

echo
echo "Billing/API checks must be performed by an authorized project owner."
echo "This script does not enable APIs, change IAM, create resources, or deploy."
echo
echo "Project metadata:"
gcloud projects describe "$PROJECT" --format='yaml(projectId,lifecycleState)' || true

echo
echo "Suggested manual checks:"
echo "1. Confirm billing is linked in Cloud Console."
echo "2. Confirm Cloud Run, Vertex AI (if selected), Firestore and Storage APIs are enabled."
echo "3. Confirm service account and user permissions are least-privilege."
echo "4. Confirm model availability, quotas, region and budget alerts."
