import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function createDynamoDBClient() {
  console.log('*******************************');
  console.log(process.env.LOCAL_DYNAMODB_URL);
  console.log(process.env.DYNAMODB_TABLE);

  // Initialize DynamoDB client
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
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
