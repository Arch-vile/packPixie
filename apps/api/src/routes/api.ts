import { FastifyInstance } from 'fastify';
import { StatusResponse } from '@packpixie/model';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

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

// Initialize DynamoDB client
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Check DynamoDB connectivity
async function checkDynamoDB() {
  const tableName = process.env.DYNAMODB_TABLE;

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
      })
    );
    return {
      status: 'connected' as const,
    };
  } catch (error) {
    return {
      status: 'error' as const,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default async function apiRoutes(fastify: FastifyInstance) {
  // Register API routes with /api prefix
  fastify.register(
    async function (fastify) {
      fastify.get('/hello', async (request, reply) => {
        return { message: 'Hello from PackPixie API!' };
      });

      fastify.get(
        '/status',
        async (request, reply): Promise<StatusResponse> => {
          const dbStatus = await checkDynamoDB();

          return {
            status: 'running',
            version: appVersion,
            timestamp: new Date().toISOString(),
            database: dbStatus,
          };
        }
      );
    },
    { prefix: '/api' }
  );
}
