import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import awsLambdaFastify from '@fastify/aws-lambda';
import apiRoutes from './routes/api.js';

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
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register API routes
await fastify.register(apiRoutes);

// Lambda handler export
export const handler = awsLambdaFastify(fastify);

// Start the server (only when running locally)
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    fastify.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Only start the server if not running in Lambda environment
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  start();
}
