import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  TransactWriteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DBStatus,
  StatusResponse,
  CreateTripRequest,
  CreateTripResponse,
  GetTripsResponse,
} from '@packpixie/model';
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

        // Trip routes
        fastify.post<{ Body: CreateTripRequest }>(
          '/trips',
          async (request, reply): Promise<CreateTripResponse> => {
            const { tripName, userEmail, participantEmails } = request.body;

            if (!tripName?.trim()) {
              return reply
                .status(400)
                .send({ error: 'tripName is required' }) as never;
            }
            if (!userEmail?.trim()) {
              return reply
                .status(400)
                .send({ error: 'userEmail is required' }) as never;
            }

            const tripId = randomUUID();
            const now = new Date().toISOString();
            const pk = `TRIP#${tripId}`;
            const name = tripName.trim();
            const creatorEmail = userEmail.trim().toLowerCase();

            // Atomically create trip META + creator participant
            await dynamoDBClient.send(
              new TransactWriteCommand({
                TransactItems: [
                  {
                    Put: {
                      TableName: conf.dynamoDBTable,
                      Item: {
                        PK: pk,
                        SK: `META#${tripId}`,
                        TripName: name,
                        CreatedAt: now,
                      },
                    },
                  },
                  {
                    Put: {
                      TableName: conf.dynamoDBTable,
                      Item: {
                        PK: pk,
                        SK: `USER#${creatorEmail}`,
                        GSI1PK: `USER#${creatorEmail}`,
                        GSI1SK: `TRIP#${tripId}`,
                        TripName: name,
                        Email: creatorEmail,
                        AddedAt: now,
                      },
                    },
                  },
                ],
              }),
            );

            // Write invited participants in chunks of 25 (BatchWrite limit)
            const validEmails = (participantEmails ?? [])
              .map((e) => e.trim().toLowerCase())
              .filter((e) => e.length > 0 && e !== creatorEmail);

            for (let i = 0; i < validEmails.length; i += 25) {
              const chunk = validEmails.slice(i, i + 25);
              await dynamoDBClient.send(
                new BatchWriteCommand({
                  RequestItems: {
                    [conf.dynamoDBTable]: chunk.map((email) => ({
                      PutRequest: {
                        Item: {
                          PK: pk,
                          SK: `USER#${email}`,
                          GSI1PK: `USER#${email}`,
                          GSI1SK: `TRIP#${tripId}`,
                          TripName: name,
                          Email: email,
                          AddedAt: now,
                        },
                      },
                    })),
                  },
                }),
              );
            }

            return reply.status(201).send({
              tripId,
              tripName: name,
              createdAt: now,
            });
          },
        );

        fastify.get<{ Querystring: { userEmail?: string } }>(
          '/trips',
          async (request, reply): Promise<GetTripsResponse> => {
            const { userEmail } = request.query;

            if (!userEmail?.trim()) {
              return reply.status(400).send({
                error: 'userEmail query parameter is required',
              }) as never;
            }

            const result = await dynamoDBClient.send(
              new QueryCommand({
                TableName: conf.dynamoDBTable,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :gsi1pk',
                ExpressionAttributeValues: {
                  ':gsi1pk': `USER#${userEmail.trim().toLowerCase()}`,
                },
              }),
            );

            const tripItems = result.Items ?? [];

            // Fetch all participants for each trip in parallel
            const trips = await Promise.all(
              tripItems.map(async (item) => {
                const tripId = (item.GSI1SK as string).replace('TRIP#', '');

                const participantsResult = await dynamoDBClient.send(
                  new QueryCommand({
                    TableName: conf.dynamoDBTable,
                    KeyConditionExpression: 'PK = :pk',
                    ExpressionAttributeValues: {
                      ':pk': `TRIP#${tripId}`,
                    },
                    ProjectionExpression: 'SK, Email',
                  }),
                );

                const participants = (participantsResult.Items ?? [])
                  .filter((p) => (p.SK as string).startsWith('USER#'))
                  .map((p) => p.Email as string)
                  .filter(Boolean);

                return {
                  tripId,
                  tripName: item.TripName as string,
                  createdAt: item.AddedAt as string,
                  participants,
                };
              }),
            );

            return { trips };
          },
        );
      },
      { prefix: '/api' },
    );
  };
}
