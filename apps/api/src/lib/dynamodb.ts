import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DBStatus } from '@packpixie/model';
import { Config } from '../config.js';

// Human-readable description of which DynamoDB endpoint the app is configured
// to talk to — logged at startup so it's always obvious whether requests are
// hitting DynamoDB Local or real AWS DynamoDB.
export function describeDynamoDBEndpoint(): string {
  return process.env.LOCAL_DYNAMODB_URL
    ? process.env.LOCAL_DYNAMODB_URL
    : `AWS DynamoDB (region ${process.env.AWS_REGION || 'us-east-1'})`;
}

export async function checkDynamoDBConnection(
  conf: Config,
  dynamoDBClient: DynamoDBDocumentClient,
): Promise<DBStatus> {
  const tableName = conf.dynamoDBTable;

  if (!tableName) {
    return {
      status: 'disconnected',
      message: 'DynamoDB table name not configured',
    };
  }

  try {
    await dynamoDBClient.send(
      new DescribeTableCommand({
        TableName: tableName,
      }),
    );
    return {
      status: 'connected',
      message: 'Successfully connected to DynamoDB',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function createDynamoDBClient() {
  // Initialize DynamoDB client
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    // Only set endpoint if LOCAL_DYNAMODB_URL is defined, otherwise use default AWS endpoint
    ...(process.env.LOCAL_DYNAMODB_URL && {
      endpoint: process.env.LOCAL_DYNAMODB_URL,
      // DynamoDB Local ignores credentials, but the SDK still requires some to sign
      // requests. Supply dummy creds so local/E2E runs don't depend on real AWS
      // credentials in the environment (in CI they're stripped by Turbo's strict
      // env mode). Production (no LOCAL_DYNAMODB_URL) falls through to the default
      // provider chain — the Lambda execution role.
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
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
