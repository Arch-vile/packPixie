import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import awsLambdaFastify from '@fastify/aws-lambda';
import { apiRoutes } from './routes/api.js';
import { config, Config } from './config.js';
import 'dotenv/config';
import {
  createDynamoDBClient,
  checkDynamoDBConnection,
  describeDynamoDBEndpoint,
} from './lib/dynamodb.js';

console.log(
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
);
console.log(process.env.NODE_ENV);

// Only ever honored when NODE_ENV=development, even if the env var is set elsewhere.
const authDevBypass =
  process.env.NODE_ENV === 'development' &&
  process.env.AUTH_DEV_BYPASS === 'true';

if (authDevBypass) {
  console.warn(
    'AUTH_DEV_BYPASS is enabled — Cognito verification is DISABLED. Local dev only, never set this in production.',
  );
}

const conf: Config = config()
  .dynamoDBTable(process.env.DYNAMODB_TABLE)
  .cognitoUserPoolId(process.env.COGNITO_USER_POOL_ID)
  .cognitoClientId(process.env.COGNITO_CLIENT_ID)
  .authDevBypass(authDevBypass)
  .build();

// Initialize DynamoDB client
const dynamoDBClient = createDynamoDBClient();

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

// Register plugins
await fastify.register(helmet, {
  contentSecurityPolicy: false,
});

await fastify.register(cors, {
  origin:
    process.env.NODE_ENV === 'production' ? ['https://your-domain.com'] : true,
});

await fastify.register(sensible);

// Health check route
fastify.get('/health', async (_request, _reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register API routes
await fastify.register(apiRoutes(conf, dynamoDBClient));

// Lambda handler export
export const handler = awsLambdaFastify(fastify);

// Logs whether DynamoDB is actually reachable, without blocking or failing
// server startup on it — some environments (e.g. the E2E harness's Testcontainers
// setup) intentionally bring DynamoDB up only after this server starts listening.
function logDynamoDBConnectivity() {
  fastify.log.info(
    `DynamoDB endpoint: ${describeDynamoDBEndpoint()} (table "${conf.dynamoDBTable}")`,
  );
  checkDynamoDBConnection(conf, dynamoDBClient)
    .then((dbStatus) => {
      if (dbStatus.status === 'connected') {
        fastify.log.info('DynamoDB connectivity check passed');
      } else {
        fastify.log.error(
          `DynamoDB connectivity check failed: ${dbStatus.message}`,
        );
      }
    })
    .catch((err) => fastify.log.error({ err }, 'DynamoDB connectivity check errored'));
}

// Start the server (only when running locally)
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    fastify.log.info(`Server listening on ${host}:${port}`);
    logDynamoDBConnectivity();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Only start the server if not running in Lambda environment
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  start();
}
