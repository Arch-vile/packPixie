#!/usr/bin/env bash
# Setup script for E2E test environment.
# Pulls Cognito values from AWS Secrets Manager, writes .env.test, and creates the
# Cognito test user. Requires AWS credentials in the environment (locally: your
# configured profile/SSO; in CI: aws-actions/configure-aws-credentials). No Terraform
# state needed — reads the same secrets deploy-api.yml consumes.
#
# Usage:
#   TEST_USER_EMAIL=you@example.com TEST_USER_PASSWORD=YourPass123! ./apps/e2e/setup-env.sh
#   ./apps/e2e/setup-env.sh you@example.com YourPass123!

set -euo pipefail

EMAIL="${TEST_USER_EMAIL:-${1:-}}"
PASSWORD="${TEST_USER_PASSWORD:-${2:-}}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Usage: TEST_USER_EMAIL=... TEST_USER_PASSWORD=... $0"
  echo "  or:  $0 <email> <password>"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/e2e/.env.test"

# 1. Copy template if .env.test doesn't exist yet
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$REPO_ROOT/apps/e2e/.env.example" "$ENV_FILE"
  echo "✓ Created $ENV_FILE from .env.example"
fi

# 2. Pull Cognito values from AWS Secrets Manager (same secrets deploy-api.yml uses).
#    No Terraform state required — works identically locally and in CI.
REGION="${AWS_REGION:-us-east-1}"
echo "→ Reading Cognito IDs from AWS Secrets Manager (region $REGION)..."
POOL_ID=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id pack-pixie/cognito-user-pool-id --query SecretString --output text)
CLIENT_ID=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id pack-pixie/cognito-user-pool-client-id --query SecretString --output text)

# 3. Write values into .env.test.
#    `sed -i ''` is BSD/macOS-only and errors under GNU sed (Linux CI runners), so route
#    each edit through a temp file — portable across both.
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

# 4. Create the Cognito test user
# admin-create-user is idempotent when --message-action SUPPRESS is set and the user already
# exists — it returns UsernameExistsException which we swallow with || true.
echo "→ Creating Cognito test user: $EMAIL"

aws cognito-idp admin-create-user \
  --region "$REGION" \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --temporary-password TempPass123! \
  --message-action SUPPRESS 2>/dev/null || true

aws cognito-idp admin-set-user-password \
  --region "$REGION" \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent

# Mark email as verified so Amplify skips the "verify your email" step after login
aws cognito-idp admin-update-user-attributes \
  --region "$REGION" \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email_verified,Value=true Name=email,Value="$EMAIL"

echo "✓ Cognito test user ready: $EMAIL"
echo ""
echo "Run 'pnpm test:e2e' from the repo root to start the E2E suite."
