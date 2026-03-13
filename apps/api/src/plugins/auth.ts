import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Config } from '../config';

export interface AuthUser {
  sub: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export function authPlugin(conf: Config) {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: conf.cognitoUserPoolId,
    tokenUse: 'id',
    clientId: conf.cognitoClientId,
  });

  return fp(async function (fastify: FastifyInstance) {
    fastify.decorateRequest('user', undefined as unknown as AuthUser);

    fastify.addHook('onRequest', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.unauthorized('Missing or invalid Authorization header');
      }

      const token = authHeader.slice(7);
      try {
        const payload = await verifier.verify(token);
        request.user = {
          sub: payload.sub,
          email: payload.email as string,
        };
      } catch (err) {
        request.log.warn({ err }, 'JWT verification failed');
        return reply.unauthorized('Invalid or expired token');
      }
    });
  });
}
