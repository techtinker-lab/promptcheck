import { CreateCheckoutPayloadSchema, ErrorCodes, PLANS } from '@promptcheck/shared';
import type { FastifyPluginAsync } from 'fastify';
import type Stripe from 'stripe';
import { env } from '../../config/env.js';
import { authenticateUser } from '../../plugins/auth.plugin.js';
import { billingService, stripe } from './billing.service.js';

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // 1. GET /api/v1/billing/plans (Público)
  // ---------------------------------------------------------------------------
  fastify.get('/plans', async (_request, reply) => {
    return reply.send({
      plans: Object.values(PLANS),
    });
  });

  // ---------------------------------------------------------------------------
  // 2. GET /api/v1/billing/subscription (Autenticado)
  // ---------------------------------------------------------------------------
  fastify.get('/subscription', { preHandler: [authenticateUser] }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }

    const subscription = await billingService.getUserSubscription(user.id);
    return reply.send({ subscription });
  });

  // ---------------------------------------------------------------------------
  // 3. POST /api/v1/billing/checkout (Autenticado)
  // ---------------------------------------------------------------------------
  fastify.post('/checkout', { preHandler: [authenticateUser] }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }

    const parseResult = CreateCheckoutPayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.SCHEMA_VALIDATION_FAILED,
          message: 'Parâmetros de checkout inválidos',
          details: parseResult.error.format(),
        },
      });
    }

    const { success_url, cancel_url } = parseResult.data;

    try {
      const result = await billingService.createCheckoutSession({
        userId: user.id,
        email: user.email,
        name: user.name,
        successUrl: success_url,
        cancelUrl: cancel_url,
      });

      return reply.send(result);
    } catch (err) {
      request.log.error(err, 'Erro ao criar sessão de checkout no Stripe');
      return reply.status(500).send({
        error: {
          code: 'STRIPE_CHECKOUT_FAILED',
          message: (err as Error).message || 'Falha ao iniciar pagamento',
        },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. POST /api/v1/billing/portal (Autenticado)
  // ---------------------------------------------------------------------------
  fastify.post('/portal', { preHandler: [authenticateUser] }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }

    const body = (request.body as { return_url?: string }) || {};

    try {
      const result = await billingService.createCustomerPortalSession({
        userId: user.id,
        returnUrl: body.return_url,
      });

      return reply.send(result);
    } catch (err) {
      return reply.status(400).send({
        error: {
          code: 'STRIPE_PORTAL_FAILED',
          message: (err as Error).message || 'Falha ao acessar portal do cliente',
        },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. POST /api/v1/billing/webhook (Público, assinado pelo Stripe)
  // ---------------------------------------------------------------------------
  fastify.post('/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const rawBody =
      (request as unknown as { rawBody?: string }).rawBody || JSON.stringify(request.body);

    let event: Stripe.Event;

    // Em ambiente de teste local com mock secret:
    if (env.STRIPE_SECRET_KEY === 'sk_test_mock_stripe_key' || !sig) {
      event = request.body as Stripe.Event;
    } else {
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig as string, env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        request.log.warn({ err }, 'Assinatura inválida no webhook do Stripe');
        return reply.status(400).send({
          error: {
            code: 'INVALID_STRIPE_SIGNATURE',
            message: 'Webhook signature verification failed',
          },
        });
      }
    }

    try {
      await billingService.handleWebhookEvent(event);
      return reply.send({ received: true });
    } catch (err) {
      request.log.error(err, 'Erro ao processar evento de webhook do Stripe');
      return reply.status(500).send({
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Falha ao processar evento',
        },
      });
    }
  });
};
