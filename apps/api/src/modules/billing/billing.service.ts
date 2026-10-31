import {
  PLANS,
  type PlanLimits,
  type PlanTier,
  type SubscriptionResponse,
  type SubscriptionStatus,
} from '@promptcheck/shared';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { db } from '../../db/connection.js';
import { projects, subscriptions, testRuns, users } from '../../db/schema.js';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
  typescript: true,
});

export class BillingService {
  /**
   * Obtém a assinatura atual do usuário e calcula o uso em tempo real.
   */
  async getUserSubscription(userId: string): Promise<SubscriptionResponse> {
    const [subRecord] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    const planTier: PlanTier = (subRecord?.plan as PlanTier) || 'free';
    const status: SubscriptionStatus = (subRecord?.status as SubscriptionStatus) || 'active';
    const isActive = status === 'active' || status === 'trialing';
    const planDef = PLANS[planTier] || PLANS.free;

    // 1. Contagem de projetos ativos do usuário
    const [projectCountRes] = await db
      .select({ val: count() })
      .from(projects)
      .where(eq(projects.ownerId, userId));
    const currentProjects = projectCountRes?.val ?? 0;

    // 2. Contagem de casos executados no mês corrente
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const userProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.ownerId, userId));

    let totalCasesThisMonth = 0;
    if (userProjects.length > 0) {
      const projectIds = userProjects.map((p) => p.id);
      const [casesRes] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${testRuns.totalCases}), 0)`,
        })
        .from(testRuns)
        .where(
          and(sql`${testRuns.projectId} IN ${projectIds}`, gte(testRuns.executedAt, startOfMonth))
        );
      totalCasesThisMonth = Number(casesRes?.total ?? 0);
    }

    return {
      plan: planTier,
      status,
      is_active: isActive,
      current_period_end: subRecord?.currentPeriodEnd
        ? subRecord.currentPeriodEnd.toISOString()
        : null,
      cancel_at_period_end: subRecord?.cancelAtPeriodEnd ?? false,
      limits: planDef.limits,
      usage: {
        current_projects: currentProjects,
        total_cases_this_month: totalCasesThisMonth,
      },
    };
  }

  /**
   * Cria uma sessão de checkout do Stripe para assinatura do plano Pro.
   */
  async createCheckoutSession(params: {
    userId: string;
    email: string;
    name: string;
    successUrl?: string | undefined;
    cancelUrl?: string | undefined;
  }): Promise<{ checkout_url: string }> {
    const { userId, email, name, successUrl, cancelUrl } = params;

    // Verifica se usuário já tem stripe_customer_id salvo
    const [subRecord] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    let customerId = subRecord?.stripeCustomerId;

    if (!customerId) {
      // Se estamos em mock/test environment sem chaves reais da Stripe
      if (env.STRIPE_SECRET_KEY === 'sk_test_mock_stripe_key') {
        customerId = `cus_mock_${userId.slice(0, 8)}`;
      } else {
        const customer = await stripe.customers.create({
          email,
          name,
          metadata: { userId },
        });
        customerId = customer.id;
      }

      if (subRecord) {
        await db
          .update(subscriptions)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(subscriptions.id, subRecord.id));
      } else {
        await db.insert(subscriptions).values({
          userId,
          stripeCustomerId: customerId,
          plan: 'free',
          status: 'active',
        });
      }
    }

    // Se mock de teste, retorna URL mock
    if (env.STRIPE_SECRET_KEY === 'sk_test_mock_stripe_key') {
      return {
        checkout_url: `https://checkout.stripe.com/mock-session?user=${userId}&plan=pro`,
      };
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: env.STRIPE_PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url:
        successUrl || `${env.DASHBOARD_URL}/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: cancelUrl || `${env.DASHBOARD_URL}/billing?canceled=true`,
      metadata: { userId },
    });

    if (!session.url) {
      throw new Error('Falha ao gerar URL da sessão de checkout no Stripe');
    }

    return { checkout_url: session.url };
  }

  /**
   * Cria sessão do Stripe Customer Portal para gerenciamento de cartão e cancelamento.
   */
  async createCustomerPortalSession(params: {
    userId: string;
    returnUrl?: string | undefined;
  }): Promise<{ portal_url: string }> {
    const { userId, returnUrl } = params;

    const [subRecord] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    const customerId = subRecord?.stripeCustomerId;
    if (!customerId) {
      throw new Error('Cliente ainda não possui cadastro de cobrança associado');
    }

    if (env.STRIPE_SECRET_KEY === 'sk_test_mock_stripe_key') {
      return {
        portal_url: `https://billing.stripe.com/p/session/mock-portal?customer=${customerId}`,
      };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${env.DASHBOARD_URL}/billing`,
    });

    return { portal_url: session.url };
  }

  /**
   * Processa Webhooks oficiais enviados pelo Stripe.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId) {
          const [existing] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

          if (existing) {
            await db
              .update(subscriptions)
              .set({
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                plan: 'pro',
                status: 'active',
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.id, existing.id));
          } else {
            await db.insert(subscriptions).values({
              userId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              plan: 'pro',
              status: 'active',
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const subId = sub.id;
        const status = sub.status as SubscriptionStatus;
        const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
        const cancelAtPeriodEnd = sub.cancel_at_period_end;

        await db
          .update(subscriptions)
          .set({
            status,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            cancelAtPeriodEnd,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, subId));
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const subId = sub.id;

        await db
          .update(subscriptions)
          .set({
            plan: 'free',
            status: 'canceled',
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, subId));
        break;
      }

      default:
        // Outros eventos ignorados com sucesso
        break;
    }
  }

  /**
   * Verifica se o usuário tem permissão para criar mais projetos.
   */
  async checkProjectQuota(
    userId: string
  ): Promise<{ allowed: boolean; max: number; current: number }> {
    const sub = await this.getUserSubscription(userId);
    return {
      allowed: sub.usage.current_projects < sub.limits.max_projects,
      max: sub.limits.max_projects,
      current: sub.usage.current_projects,
    };
  }

  /**
   * Verifica se o projeto atingiu a quota mensal de testes do plano do proprietário.
   */
  async checkRunsQuota(
    projectId: string
  ): Promise<{ allowed: boolean; max: number; current: number }> {
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return { allowed: true, max: 0, current: 0 };
    }

    const sub = await this.getUserSubscription(project.ownerId);
    return {
      allowed: sub.usage.total_cases_this_month < sub.limits.max_cases_per_month,
      max: sub.limits.max_cases_per_month,
      current: sub.usage.total_cases_this_month,
    };
  }
}

export const billingService = new BillingService();
