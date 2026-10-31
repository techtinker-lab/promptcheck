import type { PlanDefinition, SubscriptionResponse } from '@promptcheck/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/connection.js';
import { projects, refreshTokens, subscriptions, users } from '../src/db/schema.js';

describe('Billing & Stripe Subscriptions Integration', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  const userEmail = `billing-user-${Date.now()}@techtinker.com.br`;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    // 1. Cadastra usuário de teste
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Billing Tester',
        email: userEmail,
        password: 'Password123!',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const cookies = regRes.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies.join('; ') : (cookies as string);
    userId = regRes.json().user.id;
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
    await app.close();
  });

  // 1. Planos Públicos
  it('returns public list of plans without authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/plans',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { plans: PlanDefinition[] };
    expect(body.plans).toBeInstanceOf(Array);
    expect(body.plans.length).toBeGreaterThanOrEqual(3);

    const freePlan = body.plans.find((p) => p.id === 'free');
    expect(freePlan?.limits.max_projects).toBe(1);

    const proPlan = body.plans.find((p) => p.id === 'pro');
    expect(proPlan?.price_brl_monthly).toBe(97);
  });

  // 2. Consulta de Assinatura (Hobby por padrão)
  it('returns active free subscription with usage for new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/subscription',
      headers: {
        cookie: authCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { subscription: SubscriptionResponse };
    expect(body.subscription.plan).toBe('free');
    expect(body.subscription.status).toBe('active');
    expect(body.subscription.is_active).toBe(true);
    expect(body.subscription.usage.current_projects).toBe(0);
    expect(body.subscription.limits.max_projects).toBe(1);
  });

  // 3. Criação de Sessão de Checkout
  it('generates a Stripe checkout session url for Pro plan upgrade', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/checkout',
      headers: {
        cookie: authCookie,
      },
      payload: {
        plan: 'pro',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { checkout_url: string };
    expect(body.checkout_url).toBeDefined();
    expect(body.checkout_url).toContain('stripe.com');
  });

  // 4. Portal do Cliente
  it('generates customer portal session once customer ID is linked', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/portal',
      headers: {
        cookie: authCookie,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { portal_url: string };
    expect(body.portal_url).toBeDefined();
    expect(body.portal_url).toContain('stripe.com');
  });

  // 5. Webhook Stripe: Upgrade para Pro após Checkout Concluído
  it('handles checkout.session.completed webhook and upgrades user to Pro', async () => {
    const webhookPayload = {
      id: `evt_mock_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: `cus_stripe_${Date.now()}`,
          subscription: `sub_stripe_${Date.now()}`,
          metadata: {
            userId,
          },
        },
      },
    };

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhook',
      payload: webhookPayload,
    });

    expect(webhookRes.statusCode).toBe(200);
    expect(webhookRes.json()).toEqual({ received: true });

    // Verifica se plano agora é Pro
    const checkRes = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/subscription',
      headers: {
        cookie: authCookie,
      },
    });

    const body = checkRes.json() as { subscription: SubscriptionResponse };
    expect(body.subscription.plan).toBe('pro');
    expect(body.subscription.limits.max_projects).toBe(10);
  });

  // 6. Webhook Stripe: Cancelamento de Assinatura
  it('handles customer.subscription.deleted webhook and downgrades user to Free', async () => {
    // Busca o subscription id salvo
    const subRes = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/subscription',
      headers: {
        cookie: authCookie,
      },
    });
    expect(subRes.statusCode).toBe(200);

    const [subRecord] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));
    expect(subRecord?.stripeSubscriptionId).toBeDefined();

    const webhookPayload = {
      id: `evt_mock_cancel_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subRecord?.stripeSubscriptionId,
        },
      },
    };

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhook',
      payload: webhookPayload,
    });

    expect(webhookRes.statusCode).toBe(200);

    // Verifica se voltou para o plano Free
    const checkRes = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/subscription',
      headers: {
        cookie: authCookie,
      },
    });

    const body = checkRes.json() as { subscription: SubscriptionResponse };
    expect(body.subscription.plan).toBe('free');
  });

  // 7. Enforcing Quotas: Free user cannot exceed max_projects limit
  it('blocks project creation when Free user exceeds max_projects limit', async () => {
    // Cria o 1º projeto (permitido no plano Free)
    const proj1 = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        cookie: authCookie,
      },
      payload: {
        name: 'Primeiro Projeto',
        slug: 'primeiro-projeto',
      },
    });
    expect(proj1.statusCode).toBe(201);

    // Tenta criar o 2º projeto (bloqueado no plano Free)
    const proj2 = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        cookie: authCookie,
      },
      payload: {
        name: 'Segundo Projeto',
        slug: 'segundo-projeto',
      },
    });

    expect(proj2.statusCode).toBe(403);
    const body = proj2.json();
    expect(body.error.code).toBe('PROJECT_LIMIT_EXCEEDED');
  });
});
