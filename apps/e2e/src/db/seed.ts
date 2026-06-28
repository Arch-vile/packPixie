import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

export const TRIP_ID = 'test-trip-001';
export const USER_ID = 'test-user-001';
export const ITEM_ID = 'test-item-001';

export async function seedTestData(client: DynamoDBClient): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE ?? 'packpixie-test';
  const now = new Date().toISOString();

  // Trip metadata
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        PK: { S: `TRIP#${TRIP_ID}` },
        SK: { S: `META#${TRIP_ID}` },
        TripName: { S: 'Test Trip' },
        CreatedAt: { S: now },
      },
    }),
  );

  // Participant record (populates GSI1 for dashboard access pattern)
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        PK: { S: `TRIP#${TRIP_ID}` },
        SK: { S: `USER#${USER_ID}` },
        GSI1PK: { S: `USER#${USER_ID}` },
        GSI1SK: { S: `TRIP#${TRIP_ID}` },
        TripName: { S: 'Test Trip' },
        AddedAt: { S: now },
      },
    }),
  );

  // Packing item
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        PK: { S: `TRIP#${TRIP_ID}` },
        SK: { S: `ITEM#${ITEM_ID}` },
        Name: { S: 'Test Item' },
        Qty: { N: '1' },
        Weight: { S: '100g' },
        Status: { S: 'to-buy' },
        Consumable: { BOOL: false },
        Category: { S: 'Gear' },
      },
    }),
  );
}
