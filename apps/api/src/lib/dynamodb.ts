import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function createDynamoDBClient() {
  // Initialize DynamoDB client
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    // Only set endpoint if LOCAL_DYNAMODB_URL is defined, otherwise use default AWS endpoint
    ...(process.env.LOCAL_DYNAMODB_URL && {
      endpoint: process.env.LOCAL_DYNAMODB_URL,
    }),
  });

  // Create a DynamoDB Document client for simplified operations
  const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });

  return dynamoDB;
}
