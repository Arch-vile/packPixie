#!/usr/bin/env bash
# Starts DynamoDB Local before Playwright's webServer processes (the API and
# Vite dev server), which start before global-setup.ts runs. That means it's
# too late for global-setup.ts to bring DynamoDB up itself — the API's own
# startup DynamoDB check would already have run against nothing. Reuses an
# already-running container across repeated local runs, matching webServer's
# reuseExistingServer behavior; global-setup.ts/global-teardown.ts still
# create/delete the actual table on each run to keep test state clean.
#
# -sharedDb is required: without it, DynamoDB Local partitions tables by AWS
# credentials + region — see apps/api/src/lib/dynamodb.ts and README.md.

set -euo pipefail

CONTAINER_NAME=packpixie-e2e-dynamodb-local

if ! docker ps --filter "name=^${CONTAINER_NAME}\$" --filter status=running --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  # Remove any stopped/stale container left over from a previous crashed run.
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER_NAME" -p 8000:8000 amazon/dynamodb-local \
    -jar DynamoDBLocal.jar -inMemory -sharedDb
fi

echo "→ Waiting for DynamoDB Local on :8000..."
for _ in $(seq 1 30); do
  if AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
    aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-east-1 >/dev/null 2>&1; then
    echo "✓ DynamoDB Local is ready"
    exit 0
  fi
  sleep 1
done

echo "✗ DynamoDB Local did not become ready in time" >&2
exit 1
