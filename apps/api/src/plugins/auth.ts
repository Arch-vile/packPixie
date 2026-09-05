import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Config } from '../config.js';

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
  const verifier = conf.authDevBypass
    ? null
    : CognitoJwtVerifier.create({
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

      // AUTH_DEV_BYPASS: skip Cognito verification and trust a hand-crafted
      // payload instead, e.g. Authorization: Bearer {"sub":"u1","email":"a@b.com"}
      if (conf.authDevBypass) {
        let payload: unknown;
        try {
          payload = JSON.parse(token);
        } catch {
          payload = undefined;
        }
        const user = payload as Partial<AuthUser> | undefined;
        if (
          !user ||
          typeof user.sub !== 'string' ||
          typeof user.email !== 'string'
        ) {
          return reply.unauthorized(
            'AUTH_DEV_BYPASS: expected Bearer token to be JSON like {"sub":"...","email":"..."}',
          );
        }
        request.user = { sub: user.sub, email: user.email };
        return;
      }

      try {
        const payload = await verifier!.verify(token);
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
