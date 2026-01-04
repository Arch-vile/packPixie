import { FastifyInstance } from 'fastify';
import { StatusResponse } from '@packpixie/model';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
            version: appVersion,
            timestamp: new Date().toISOString(),
          };
        }
      );
    },
    { prefix: '/api' }
  );
}
