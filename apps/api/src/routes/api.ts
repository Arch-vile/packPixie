import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { DBStatus, StatusResponse } from '@packpixie/model';
import { FastifyInstance } from 'fastify';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Config } from '../config';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let appVersion = 'unknown';
try {
  const versionPath = join(__dirname, '..', 'version.json');
  const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
  appVersion = versionData.version;
} catch (error) {
  appVersion = 'error';
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

        fastify.get('/comments', async (request, reply) => {
          const result = await dynamoDBClient.send(
            new QueryCommand({
              TableName: conf.dynamoDBTable,
              KeyConditionExpression: 'PK = :pk',
              ExpressionAttributeValues: { ':pk': 'COMMENTS' },
              ScanIndexForward: false,
            }),
          );

          const comments = (result.Items ?? []).map((item) => ({
            id: item.SK as string,
            text: item.text as string,
            createdAt: item.createdAt as string,
          }));

          return { comments };
        });

        fastify.post('/comments', async (request, reply) => {
          const body = request.body as { text?: string };
          const text = body?.text?.trim();

          if (!text) {
            return reply.status(400).send({ error: 'text is required' });
          }

          const now = new Date().toISOString();
          const id = randomUUID();
          const sk = `${now}#${id}`;

          await dynamoDBClient.send(
            new PutCommand({
              TableName: conf.dynamoDBTable,
              Item: {
                PK: 'COMMENTS',
                SK: sk,
                text,
                createdAt: now,
              },
            }),
          );

          return reply.status(201).send({ id: sk, text, createdAt: now });
        });
      },
      { prefix: '/api' },
    );
  };
}
