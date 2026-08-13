import {
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  StatusResponse,
  CreateTripRequest,
  CreateTripResponse,
  GetTripsResponse,
  TripDetailResponse,
} from '@packpixie/model';
import { FastifyInstance } from 'fastify';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Config } from '../config.js';
import { authPlugin } from '../plugins/auth.js';
import { checkDynamoDBConnection } from '../lib/dynamodb.js';
import { mapItemRecord } from '../lib/tripDetail.js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let appVersion = 'unknown';
try {
  const versionPath = join(__dirname, '..', 'version.json');
  const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
  appVersion = versionData.version;
} catch (_error) {
  appVersion = 'error';
}

export function apiRoutes(
  conf: Config,
  dynamoDBClient: DynamoDBDocumentClient,
) {
  return async function (fastify: FastifyInstance) {
    // Register API routes with /api prefix
    fastify.register(
      async function (fastify) {
        // Public routes (no auth)
        fastify.get('/hello', async (_request, _reply) => {
          return { message: 'Hello from PackPixie API!' };
        });

        fastify.get(
          '/status',
          async (_request, _reply): Promise<StatusResponse> => {
            const dbStatus = await checkDynamoDBConnection(conf, dynamoDBClient);

            return {
              status: 'running',
              version: appVersion,
              timestamp: new Date().toISOString(),
              database: dbStatus,
            };
          },
        );

        // Protected routes (auth required)
        fastify.register(async function (protected_) {
          await protected_.register(authPlugin(conf));

          // Trip routes
          protected_.post<{ Body: CreateTripRequest }>(
            '/trips',
            async (request, reply): Promise<CreateTripResponse> => {
              const { tripName, participantEmails } = request.body;
              const userEmail = request.user.email;

              if (!tripName?.trim()) {
                return reply
                  .status(400)
                  .send({ error: 'tripName is required' }) as never;
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

          protected_.get(
            '/trips',
            async (request, _reply): Promise<GetTripsResponse> => {
              const userEmail = request.user.email;

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

          protected_.get<{ Params: { tripId: string } }>(
            '/trips/:tripId',
            async (request, reply): Promise<TripDetailResponse> => {
              const { tripId } = request.params;
              // Identity comes only from the verified JWT, never the path param
              // or body. Lowercase to match the write-path USER# key normalization.
              const callerEmail = request.user.email.trim().toLowerCase();

              const result = await dynamoDBClient.send(
                new QueryCommand({
                  TableName: conf.dynamoDBTable,
                  KeyConditionExpression: 'PK = :pk',
                  ExpressionAttributeValues: {
                    ':pk': `TRIP#${tripId}`,
                  },
                }),
              );

              const records = result.Items ?? [];

              // Participation guard (enumeration-resistant): a single branch
              // serves both failure modes — non-existent trip (zero records) and
              // foreign trip (records but no matching USER#). Both yield an
              // identical 404; never a 403, never a distinguishable response.
              const isMember = records.some(
                (r) => (r.SK as string) === `USER#${callerEmail}`,
              );
              if (!isMember) {
                return reply
                  .status(404)
                  .send({ error: 'Trip not found' }) as never;
              }

              const meta = records.find((r) =>
                (r.SK as string).startsWith('META#'),
              );
              const participants = records
                .filter((r) => (r.SK as string).startsWith('USER#'))
                .map((r) => r.Email as string)
                .filter(Boolean);
              const items = records
                .filter((r) => (r.SK as string).startsWith('ITEM#'))
                .map(mapItemRecord);

              return {
                tripId,
                tripName: (meta?.TripName as string) ?? '',
                participants,
                items,
              };
            },
          );
        });
      },
      { prefix: '/api' },
    );
  };
}
