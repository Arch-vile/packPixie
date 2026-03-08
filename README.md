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

## Accessing production

To print the UI URL:

```bash
terraform output s3_website_endpoint
```

To print the API URL:

```bash
terraform output api_gateway_ur
```
