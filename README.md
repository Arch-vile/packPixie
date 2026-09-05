# PackPixie

App for managing gear for outdoor adventures

## Development

### Local DynamoDB Setup

For local development, you need to run DynamoDB locally using Docker:

```bash
# Start DynamoDB Local
docker run -d -p 8000:8000 amazon/dynamodb-local

# Create the local table (one-time setup)
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

### Calling protected API routes without logging in

Protected routes normally require a Cognito ID token. For local testing (curl,
Postman, scripts), set `AUTH_DEV_BYPASS=true` when starting `apps/api` — this is
only honored when `NODE_ENV=development` (which `pnpm --filter api dev` sets
automatically) and is ignored under any other `NODE_ENV`, so it can't be
enabled by accident in a deployed environment.

```bash
AUTH_DEV_BYPASS=true DYNAMODB_TABLE=packpixie-local pnpm --filter api dev
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
