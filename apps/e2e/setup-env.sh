#!/usr/bin/env bash
# Setup script for the E2E test environment.
# Reads all Cognito + test-user values from AWS Secrets Manager and writes
# apps/e2e/.env.test. The test user itself is provisioned by Terraform
# (infra/cognito.tf), so this script only reads — it never creates users and
# needs no cognito-idp:Admin* permissions.
#
# Requires AWS credentials in the environment (locally: your configured
# profile/SSO; in CI: aws-actions/configure-aws-credentials). Same secrets the
# deploy workflows consume — all under pack-pixie/*.
#
# Usage:
#   ./apps/e2e/setup-env.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/e2e/.env.test"
REGION="${AWS_REGION:-us-east-1}"

# 1. Copy template if .env.test doesn't exist yet (provides the non-secret
#    defaults: DYNAMODB_TABLE, LOCAL_DYNAMODB_URL, BASE_URL, VITE_*, etc.)
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$REPO_ROOT/apps/e2e/.env.example" "$ENV_FILE"
  echo "✓ Created $ENV_FILE from .env.example"
fi

# 2. Read secrets from AWS Secrets Manager (all under pack-pixie/*).
echo "→ Reading Cognito config and test-user credentials from Secrets Manager (region $REGION)..."
read_secret() {
  aws secretsmanager get-secret-value --region "$REGION" \
    --secret-id "$1" --query SecretString --output text
}

POOL_ID=$(read_secret pack-pixie/cognito-user-pool-id)
CLIENT_ID=$(read_secret pack-pixie/cognito-user-pool-client-id)
EMAIL=$(read_secret pack-pixie/e2e-test-user-email)
PASSWORD=$(read_secret pack-pixie/e2e-test-user-password)

# 3. Write values into .env.test.
#    `sed -i ''` is BSD/macOS-only and errors under GNU sed (Linux CI runners),
#    so route each edit through a temp file — portable across both.
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  sed "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
}

set_env COGNITO_USER_POOL_ID "$POOL_ID"
set_env COGNITO_CLIENT_ID "$CLIENT_ID"
set_env VITE_COGNITO_USER_POOL_ID "$POOL_ID"
set_env VITE_COGNITO_USER_POOL_CLIENT_ID "$CLIENT_ID"
set_env TEST_USER_EMAIL "$EMAIL"
set_env TEST_USER_PASSWORD "$PASSWORD"

echo "✓ .env.test updated"
echo ""
echo "Run 'pnpm test:e2e' from the repo root to start the E2E suite."
