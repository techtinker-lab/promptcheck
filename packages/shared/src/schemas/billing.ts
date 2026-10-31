import { z } from 'zod';

export const PlanTierSchema = z.enum(['free', 'pro', 'enterprise']);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const SubscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const PlanLimitsSchema = z
  .object({
    max_projects: z.number().int().nonnegative(),
    max_contracts_per_project: z.number().int().nonnegative(),
    max_cases_per_month: z.number().int().nonnegative(),
    alert_webhooks: z.boolean(),
    unlimited_history: z.boolean(),
  })
  .strict();
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

export const PlanDefinitionSchema = z
  .object({
    id: PlanTierSchema,
    name: z.string(),
    price_usd_monthly: z.number(),
    price_brl_monthly: z.number(),
    features: z.array(z.string()),
    limits: PlanLimitsSchema,
  })
  .strict();
export type PlanDefinition = z.infer<typeof PlanDefinitionSchema>;

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Hobby / Starter',
    price_usd_monthly: 0,
    price_brl_monthly: 0,
    features: [
      '1 Projeto',
      'Até 3 Contratos por projeto',
      '500 execuções de casos/mês',
      'Detecção básica de Model Drift',
      'Histórico de 7 dias',
    ],
    limits: {
      max_projects: 1,
      max_contracts_per_project: 3,
      max_cases_per_month: 500,
      alert_webhooks: false,
      unlimited_history: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Developer Pro',
    price_usd_monthly: 19,
    price_brl_monthly: 97,
    features: [
      'Até 10 Projetos',
      'Até 50 Contratos por projeto',
      '25.000 execuções de casos/mês',
      'Alertas de Drift via Webhooks (Slack/Discord)',
      'Histórico completo de 90 dias',
      'Suporte prioritário da equipe',
    ],
    limits: {
      max_projects: 10,
      max_contracts_per_project: 50,
      max_cases_per_month: 25000,
      alert_webhooks: true,
      unlimited_history: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise / Custom',
    price_usd_monthly: 99,
    price_brl_monthly: 499,
    features: [
      'Projetos ilimitados',
      'Contratos ilimitados',
      'Casos de teste ilimitados',
      'SLA garantido de 99.9%',
      'Onboarding dedicado e auditoria de contratos',
    ],
    limits: {
      max_projects: 9999,
      max_contracts_per_project: 9999,
      max_cases_per_month: 1000000,
      alert_webhooks: true,
      unlimited_history: true,
    },
  },
};

export const CreateCheckoutPayloadSchema = z
  .object({
    plan: z.enum(['pro']),
    success_url: z.string().url().optional(),
    cancel_url: z.string().url().optional(),
  })
  .strict();
export type CreateCheckoutPayload = z.infer<typeof CreateCheckoutPayloadSchema>;

export const SubscriptionUsageSchema = z
  .object({
    current_projects: z.number().int().nonnegative(),
    total_cases_this_month: z.number().int().nonnegative(),
  })
  .strict();
export type SubscriptionUsage = z.infer<typeof SubscriptionUsageSchema>;

export const SubscriptionResponseSchema = z
  .object({
    plan: PlanTierSchema,
    status: SubscriptionStatusSchema,
    is_active: z.boolean(),
    current_period_end: z.string().nullable(),
    cancel_at_period_end: z.boolean(),
    limits: PlanLimitsSchema,
    usage: SubscriptionUsageSchema,
  })
  .strict();
export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>;
