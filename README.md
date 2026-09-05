# PackPixie

App for managing gear for outdoor adventures

## Development

### Local DynamoDB Setup

For local development, you need to run DynamoDB locally using Docker:

```bash
# Start DynamoDB Local. -sharedDb is required: without it, DynamoDB Local
# partitions tables by AWS credentials + region, so a table created with the
# AWS CLI's default credentials would be invisible to the app (which connects
# with dummy credentials) even though it "exists". -inMemory means all data is
# lost on restart — fine for local dev, but the table must be recreated every
# time the container restarts.
docker run -d -p 8000:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory -sharedDb

# Create the local table (needed again after every container restart)
aws dynamodb create-table \
  --endpoint-url http://localhost:8000 \
  --region us-east-1 \
  --table-name packpixie-local \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    '[{"IndexName":"GSI1","KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'
```

### Starting the app

```bash
# Set environment variables for local DynamoDB
export LOCAL_DYNAMODB_URL=http://localhost:8000
export DYNAMODB_TABLE=packpixie-local

# Start the development servers
pnpm dev
```

On startup, `apps/api` logs which DynamoDB endpoint it's configured to use and
verifies it can read the configured table before it starts listening — if that
check fails (wrong endpoint, missing table, etc.) the process logs the error
and exits immediately instead of accepting requests that would fail later.

### Calling protected API routes without logging in

Protected routes normally require a Cognito ID token. For local testing (curl,
Postman, scripts), set `AUTH_DEV_BYPASS=true` when starting `apps/api` — this is
only honored when `NODE_ENV=development` (which `pnpm --filter api dev` sets
automatically) and is ignored under any other `NODE_ENV`, so it can't be
enabled by accident in a deployed environment.

```bash
AUTH_DEV_BYPASS=true pnpm --filter api dev
```

With the flag on, the API skips Cognito verification and instead trusts a
hand-crafted `Authorization` header whose token is JSON with `sub` and `email`:

```bash
curl http://localhost:3001/api/trips \
  -H 'Authorization: Bearer {"sub":"dev-user-1","email":"dev@example.com"}' \
  -H 'Content-Type: application/json' \
  -d '{"tripName":"Test Trip","participantEmails":[]}'
```

## Accessing production

To print the UI URL:

```bash
terraform output s3_website_endpoint
```

To print the API URL:

```bash
terraform output api_gateway_url
```
