import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';

import { config } from '../config';

export function createTestDynamoDBClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: config.db.region,
    endpoint: config.db.endpoint,
    // DynamoDB Local ignores credentials but the SDK requires them to be present
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}

export async function createTable(client: DynamoDBClient): Promise<void> {
  const tableName = config.db.tableName;

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
  const tableName = config.db.tableName;

  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (err) {
    // Swallow ResourceNotFoundException — idempotent teardown (ORCH-05)
    if (!(err instanceof ResourceNotFoundException)) {
      throw err;
    }
  }
}
