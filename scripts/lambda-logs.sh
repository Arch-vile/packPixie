#!/usr/bin/env bash
# Tail Lambda logs from CloudWatch
# Usage:
#   ./scripts/lambda-logs.sh          # last 10 minutes, then follow
#   ./scripts/lambda-logs.sh 30       # last 30 minutes, then follow
#   ./scripts/lambda-logs.sh 60 --no-follow  # last 60 minutes, no follow

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
MINUTES="${1:-10}"
FOLLOW="${2:---follow}"

LOG_GROUP=$(aws --region "$REGION" logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/pack-pixie-api" \
  --query 'logGroups[0].logGroupName' \
  --output text)

if [ "$LOG_GROUP" = "None" ] || [ -z "$LOG_GROUP" ]; then
  echo "No log group found matching /aws/lambda/pack-pixie-api*"
  exit 1
fi

echo "Log group: $LOG_GROUP"
echo "Showing last ${MINUTES}m of logs..."
echo "---"

START_TIME=$(( $(date +%s) - MINUTES * 60 ))000

if [ "$FOLLOW" = "--follow" ]; then
  aws --region "$REGION" logs tail "$LOG_GROUP" --since "${MINUTES}m" --follow --format short
else
  aws --region "$REGION" logs tail "$LOG_GROUP" --since "${MINUTES}m" --format short
fi
