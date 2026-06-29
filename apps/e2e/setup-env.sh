#!/usr/bin/env bash
# Setup script for E2E test environment.
# Pulls Cognito values from Terraform, writes .env.test, and creates the Cognito test user.
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

# 2. Pull Cognito values from Terraform
echo "→ Reading Terraform outputs..."
POOL_ID=$(cd "$REPO_ROOT/infra" && terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(cd "$REPO_ROOT/infra" && terraform output -raw cognito_user_pool_client_id)
REGION=$(cd "$REPO_ROOT/infra" && terraform output -raw cognito_region)

# 3. Write values into .env.test
sed -i '' "s|^COGNITO_USER_POOL_ID=.*|COGNITO_USER_POOL_ID=$POOL_ID|"                           "$ENV_FILE"
sed -i '' "s|^COGNITO_CLIENT_ID=.*|COGNITO_CLIENT_ID=$CLIENT_ID|"                               "$ENV_FILE"
sed -i '' "s|^VITE_COGNITO_USER_POOL_ID=.*|VITE_COGNITO_USER_POOL_ID=$POOL_ID|"                 "$ENV_FILE"
sed -i '' "s|^VITE_COGNITO_USER_POOL_CLIENT_ID=.*|VITE_COGNITO_USER_POOL_CLIENT_ID=$CLIENT_ID|" "$ENV_FILE"
sed -i '' "s|^TEST_USER_EMAIL=.*|TEST_USER_EMAIL=$EMAIL|"                                        "$ENV_FILE"
sed -i '' "s|^TEST_USER_PASSWORD=.*|TEST_USER_PASSWORD=$PASSWORD|"                              "$ENV_FILE"

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
