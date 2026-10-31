import type { PlanDefinition, SubscriptionResponse } from '@promptcheck/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Check,
  CreditCard,
  ExternalLink,
  Layers,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client.js';

export function BillingPage() {
  const { t, i18n } = useTranslation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Assinatura e limites atuais do usuário
  const { data: subData, isLoading: loadingSub } = useQuery<{
    subscription: SubscriptionResponse;
  }>({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api.get<{ subscription: SubscriptionResponse }>('/api/v1/billing/subscription'),
  });

  // 2. Planos disponíveis
  const { data: plansData, isLoading: loadingPlans } = useQuery<{
    plans: PlanDefinition[];
  }>({
    queryKey: ['billing', 'plans'],
    queryFn: () => api.get<{ plans: PlanDefinition[] }>('/api/v1/billing/plans'),
  });

  // 3. Mutação de Checkout do Stripe
  const checkoutMutation = useMutation({
    mutationFn: () =>
      api.post<{ checkout_url: string }>('/api/v1/billing/checkout', {
        plan: 'pro',
      }),
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Falha ao iniciar checkout com o Stripe');
    },
  });

  // 4. Mutação do Customer Portal do Stripe
  const portalMutation = useMutation({
    mutationFn: () => api.post<{ portal_url: string }>('/api/v1/billing/portal', {}),
    onSuccess: (data) => {
      if (data.portal_url) {
        window.location.href = data.portal_url;
      }
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Falha ao abrir portal do cliente');
    },
  });

  if (loadingSub || loadingPlans) {
    return (
      <div className="flex items-center justify-center py-24 font-mono text-xs text-zinc-500">
        {t('common.loading')}
      </div>
    );
  }

  const subscription = subData?.subscription;
  const plans = plansData?.plans || [];
  const currentPlan = subscription?.plan || 'free';
  const isPt = i18n.language.startsWith('pt');

  const projectUsagePercent = subscription
    ? Math.min(
        100,
        Math.round((subscription.usage.current_projects / subscription.limits.max_projects) * 100)
      )
    : 0;

  const casesUsagePercent = subscription
    ? Math.min(
        100,
        Math.round(
          (subscription.usage.total_cases_this_month / subscription.limits.max_cases_per_month) *
            100
        )
      )
    : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            TechTinker Monetization
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-3">
          {t('billing.title')}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{t('billing.subtitle')}</p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-sm flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Overview & Quota Card */}
      {subscription && (
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 backdrop-blur space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
            <div>
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                {t('billing.currentPlan')}
              </span>
              <div className="flex items-center gap-3 mt-1">
                <h2 className="text-xl font-bold text-zinc-100 capitalize">
                  {currentPlan === 'pro'
                    ? 'Developer Pro'
                    : currentPlan === 'enterprise'
                      ? 'Enterprise'
                      : 'Hobby / Starter'}
                </h2>
                <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {t('billing.active')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {currentPlan === 'pro' ? (
                <button
                  type="button"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-100 hover:border-zinc-600 transition-colors"
                >
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>{t('billing.managePortal')}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => checkoutMutation.mutate()}
                  disabled={checkoutMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors shadow-lg shadow-emerald-500/10"
                >
                  <Zap className="w-4 h-4 fill-zinc-950" />
                  <span>
                    {checkoutMutation.isPending
                      ? t('billing.checkoutLoading')
                      : t('billing.upgradePro')}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quotas Progress Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Projetos */}
            <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-850 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                  <Layers className="w-4 h-4 text-zinc-400" />
                  {t('billing.projectsUsage')}
                </span>
                <span className="font-mono text-zinc-200">
                  {subscription.usage.current_projects} / {subscription.limits.max_projects}
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    projectUsagePercent >= 100
                      ? 'bg-rose-500'
                      : projectUsagePercent >= 80
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${projectUsagePercent}%` }}
                />
              </div>
            </div>

            {/* Casos de Teste */}
            <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-850 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                  <Activity className="w-4 h-4 text-zinc-400" />
                  {t('billing.casesUsage')}
                </span>
                <span className="font-mono text-zinc-200">
                  {subscription.usage.total_cases_this_month.toLocaleString()} /{' '}
                  {subscription.limits.max_cases_per_month.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    casesUsagePercent >= 100
                      ? 'bg-rose-500'
                      : casesUsagePercent >= 80
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${casesUsagePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {plans.map((plan) => {
          const isSelected = currentPlan === plan.id;
          const isPro = plan.id === 'pro';

          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col justify-between transition-all relative ${
                isPro
                  ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 to-zinc-900/60 shadow-xl shadow-emerald-950/20'
                  : 'border-zinc-800 bg-zinc-900/30'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-zinc-950 text-[11px] font-mono font-bold tracking-wide uppercase">
                  Recomendado
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold font-mono tracking-tight text-zinc-100">
                      {isPt ? `R$ ${plan.price_brl_monthly}` : `$${plan.price_usd_monthly}`}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">/mês</span>
                  </div>
                </div>

                <div className="border-t border-zinc-800/80 pt-4 space-y-2.5">
                  <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider block">
                    {t('billing.features')}
                  </span>
                  <ul className="space-y-2 text-xs text-zinc-300">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-8">
                {isSelected ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 px-4 rounded-lg bg-zinc-800 text-zinc-400 font-mono text-xs font-medium cursor-default border border-zinc-700/60"
                  >
                    Plano Atual
                  </button>
                ) : isPro ? (
                  <button
                    type="button"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    {checkoutMutation.isPending
                      ? t('billing.checkoutLoading')
                      : 'Assinar Pro com Stripe'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href =
                        'mailto:contato@techtinker.com.br?subject=PromptCheck%20Enterprise';
                    }}
                    className="w-full py-2.5 px-4 rounded-lg border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-750 text-zinc-200 text-xs font-mono font-medium transition-colors"
                  >
                    Falar com Especialistas
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
