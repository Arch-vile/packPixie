import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';

export function createTestDynamoDBClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.LOCAL_DYNAMODB_URL ?? 'http://localhost:8000',
    // DynamoDB Local ignores credentials but the SDK requires them to be present
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}

export async function createTable(client: DynamoDBClient): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
}

export async function deleteTable(client: DynamoDBClient): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';

  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (err) {
    // Swallow ResourceNotFoundException — idempotent teardown (ORCH-05)
    if (!(err instanceof ResourceNotFoundException)) {
      throw err;
    }
  }
}
