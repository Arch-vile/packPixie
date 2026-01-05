# DynamoDB Configuration

This application uses AWS DynamoDB as its primary database with a single-table design.

## Table Structure

The DynamoDB table uses the following structure:

- **Primary Key**:
  - Hash Key (PK): Partition key
  - Range Key (SK): Sort key
- **Global Secondary Index (GSI1)**:
  - GSI1PK: Alternative partition key
  - GSI1SK: Alternative sort key

## Features Enabled

- **Pay-per-request billing**: No capacity planning required
- **Point-in-time recovery**: Continuous backups for disaster recovery
- **Server-side encryption**: Data encrypted at rest
- **TTL**: Automatic cleanup of expired items using the `TTL` attribute

## Usage in the API

The API includes DynamoDB connectivity check in the `/api/status` endpoint:

```typescript
import { dynamoDB, DYNAMODB_TABLE } from './lib/dynamodb';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

// Example: Save an item
await dynamoDB.send(
  new PutCommand({
    TableName: DYNAMODB_TABLE,
    Item: {
      PK: 'USER#123',
      SK: 'PROFILE',
      name: 'John Doe',
      email: 'john@example.com',
    },
  })
);

// Example: Get an item
const result = await dynamoDB.send(
  new GetCommand({
    TableName: DYNAMODB_TABLE,
    Key: {
      PK: 'USER#123',
      SK: 'PROFILE',
    },
  })
);
```

## Environment Variables

- `DYNAMODB_TABLE`: The name of the DynamoDB table (automatically set by Terraform in Lambda)
- `AWS_REGION`: AWS region (defaults to us-east-1)

## Infrastructure

The DynamoDB table is provisioned via Terraform in [infra/dynamodb.tf](../infra/dynamodb.tf).

The Lambda function has the necessary IAM permissions to perform DynamoDB operations including:

- GetItem, PutItem, UpdateItem, DeleteItem
- Query, Scan
- BatchGetItem, BatchWriteItem
- DescribeTable

## Health Check

The `/api/status` endpoint includes a database health check that:

1. Verifies the DYNAMODB_TABLE environment variable is set
2. Attempts to describe the table to confirm connectivity
3. Returns status: 'connected', 'disconnected', or 'error'
