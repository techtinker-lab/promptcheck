import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { cliRoutes } from './modules/cli/cli.routes.js';
import { contractRoutes } from './modules/contracts/contracts.routes.js';
import { projectRoutes } from './modules/projects/projects.routes.js';
import { runsRoutes } from './modules/runs/runs.routes.js';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 100 * 1024, // 100 KB padrão por rota
  });

  // Preserva rawBody para verificação de assinatura em webhooks (ex: Stripe)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      (req as unknown as { rawBody?: string }).rawBody = body as string;
      const parsed = (body as string).trim().length > 0 ? JSON.parse(body as string) : {};
      done(null, parsed);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // 1. Plugins Oficiais Fastify
  app.register(cookie, {
    secret: env.COOKIE_SECRET,
  });

  app.register(cors, {
    origin: (origin, cb) => {
      // Permite requisições sem origin (como CLI ou mobile/curl)
      if (!origin) return cb(null, true);

      // Em desenvolvimento, permite localhost
      if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
        if (/^http:\/\/localhost(?::\d+)?$/.test(origin)) {
          return cb(null, true);
        }
      }

      // Em produção, permite apenas domínio oficial *.techtinker.com.br
      if (/^https:\/\/(?:[a-zA-Z0-9-]+\.)*techtinker\.com\.br$/.test(origin)) {
        return cb(null, true);
      }

      return cb(new Error('Bloqueado pela política de CORS do PromptCheck'), false);
    },
    credentials: true,
  });

  app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  // 2. Health check
  app.get('/healthz', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // 3. Registro dos Módulos REST
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(projectRoutes, { prefix: '/api/v1/projects' });
  app.register(contractRoutes, { prefix: '/api/v1/projects/:projectId/contracts' });
  app.register(runsRoutes, { prefix: '/api/v1/projects/:projectId/runs' });
  app.register(cliRoutes, { prefix: '/api/v1/cli' });
  app.register(billingRoutes, { prefix: '/api/v1/billing' });

  // 4. Tratamento Global de Erros
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Limite de requisições excedido. Tente novamente em alguns instantes.',
        },
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Requisição inválida ou parâmetros ausentes',
          details: error.validation,
        },
      });
    }

    request.log.error(error);

    return reply.status(error.statusCode || 500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          env.NODE_ENV === 'production'
            ? 'Ocorreu um erro interno no servidor'
            : error.message || 'Erro interno',
      },
    });
  });

  return app;
}
