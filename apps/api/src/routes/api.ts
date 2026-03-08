import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DBStatus, StatusResponse } from '@packpixie/model';
import { FastifyInstance } from 'fastify';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Config } from '../config';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from version.json file
let appVersion = 'dev';
try {
  const versionPath = join(__dirname, '..', 'version.json');
  const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
  appVersion = versionData.version;
} catch (error) {
  // Use default 'dev' if file doesn't exist
}

// Check DynamoDB connectivity
async function checkDynamoDB(
  conf: Config,
  dynamoDBClient: DynamoDBDocumentClient,
): Promise<DBStatus> {
  const tableName = conf.dynamoDBTable;

  if (!tableName) {
    return {
      status: 'disconnected' as const,
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
      status: 'connected' as const,
      message: 'Successfully connected to DynamoDB',
    };
  } catch (error) {
    return {
      status: 'error' as const,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function apiRoutes(
  conf: Config,
  dynamoDBClient: DynamoDBDocumentClient,
) {
  return async function (fastify: FastifyInstance) {
    // Register API routes with /api prefix
    fastify.register(
      async function (fastify) {
        fastify.get('/hello', async (request, reply) => {
          return { message: 'Hello from PackPixie API!' };
        });

        fastify.get(
          '/status',
          async (request, reply): Promise<StatusResponse> => {
            const dbStatus = await checkDynamoDB(conf, dynamoDBClient);

            return {
              status: 'running',
              version: appVersion,
              timestamp: new Date().toISOString(),
              database: dbStatus,
            };
          },
        );
      },
      { prefix: '/api' },
    );
  };
}
