import { FastifyInstance } from 'fastify';
import { StatusResponse } from '@packpixie/model';

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
          return {
            status: 'running',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
          };
        }
      );
    },
    { prefix: '/api' }
  );
}
