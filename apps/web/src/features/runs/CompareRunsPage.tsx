import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  GitBranch,
  GitCommit,
  GitCompare,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.js';
import { Card } from '../../components/ui/Card.js';
import { api } from '../../lib/api-client.js';
import type { Project, RunComparisonItem, TestRunEntity } from '../../types.js';

export function CompareRunsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const baseId = searchParams.get('base');
  const headId = searchParams.get('head');

  // 1. Fetch Project
  const { data: projectData } = useQuery<{ project: Project }>({
    queryKey: ['project', slug],
    queryFn: () => api.get<{ project: Project }>(`/api/v1/projects/${slug}`),
    enabled: Boolean(slug),
  });

  const project = projectData?.project;

  // 2. Fetch Comparison
  const { data, isLoading, error } = useQuery<{
    base: TestRunEntity;
    head: TestRunEntity;
    comparison: RunComparisonItem[];
  }>({
    queryKey: ['compare', slug, baseId, headId],
    queryFn: () =>
      api.get<{
        base: TestRunEntity;
        head: TestRunEntity;
        comparison: RunComparisonItem[];
      }>(`/api/v1/projects/${slug}/runs/compare?base=${baseId}&head=${headId}`),
    enabled: Boolean(slug && baseId && headId),
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center text-zinc-500 font-mono text-sm">{t('common.loading')}</div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center text-rose-400 font-mono text-sm space-y-3">
        <div>Erro ao carregar comparação entre as execuções selecionadas.</div>
        <Link to={`/projects/${slug}/runs`} className="text-zinc-400 underline text-xs">
          Voltar para a lista de execuções
        </Link>
      </div>
    );
  }

  const { base, head, comparison } = data;

  const basePassRate = base.totalCases > 0 ? (base.passedCases / base.totalCases) * 100 : 100;

  const headPassRate = head.totalCases > 0 ? (head.passedCases / head.totalCases) * 100 : 100;

  const passRateDelta = headPassRate - basePassRate;
  const latencyDelta = head.avgLatencyMs - base.avgLatencyMs;

  return (
    <div className="space-y-8">
      {/* Breadcrumb & Header */}
      <div>
        <Link
          to={`/projects/${slug}/runs`}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('runs.title')}</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                {t('compare.title')}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Comparando{' '}
                <span className="font-mono text-zinc-200">{base.commitSha.slice(0, 7)}</span> (Base)
                contra <span className="font-mono text-zinc-200">{head.commitSha.slice(0, 7)}</span>{' '}
                (Head)
              </p>
            </div>
          </div>
          {project && (
            <Badge variant="neutral" size="sm">
              {project.slug}
            </Badge>
          )}
        </div>
      </div>

      {/* Comparison Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Base Run Card */}
        <Card className="space-y-3 bg-zinc-950/60 border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
              {t('compare.base')}
            </span>
            <Badge
              variant={
                base.status === 'pass' ? 'pass' : base.status === 'fail' ? 'fail' : 'warning'
              }
              size="sm"
            >
              {base.status.toUpperCase()}
            </Badge>
          </div>
          <div className="text-xs font-mono space-y-1.5 text-zinc-300">
            <div className="flex items-center gap-2">
              <GitCommit className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                Commit: <strong className="text-zinc-100">{base.commitSha.slice(0, 8)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                Branch: <strong className="text-zinc-100">{base.branch}</strong>
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span>
                Taxa: <strong>{basePassRate.toFixed(1)}%</strong>
              </span>
              <span>
                Latência: <strong>{base.avgLatencyMs}ms</strong>
              </span>
            </div>
          </div>
        </Card>

        {/* Head Run Card */}
        <Card className="space-y-3 bg-zinc-950/60 border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-zinc-400 uppercase">
              {t('compare.head')}
            </span>
            <Badge
              variant={
                head.status === 'pass' ? 'pass' : head.status === 'fail' ? 'fail' : 'warning'
              }
              size="sm"
            >
              {head.status.toUpperCase()}
            </Badge>
          </div>
          <div className="text-xs font-mono space-y-1.5 text-zinc-300">
            <div className="flex items-center gap-2">
              <GitCommit className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                Commit: <strong className="text-zinc-100">{head.commitSha.slice(0, 8)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                Branch: <strong className="text-zinc-100">{head.branch}</strong>
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span>
                Taxa: <strong>{headPassRate.toFixed(1)}%</strong>
              </span>
              <span>
                Latência: <strong>{head.avgLatencyMs}ms</strong>
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Diff Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">
            {t('compare.passRateDelta')}
          </span>
          <div className="text-xl font-bold font-mono flex items-center gap-1.5">
            {passRateDelta > 0 ? (
              <>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">+{passRateDelta.toFixed(1)}%</span>
              </>
            ) : passRateDelta < 0 ? (
              <>
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span className="text-rose-400">{passRateDelta.toFixed(1)}%</span>
              </>
            ) : (
              <span className="text-zinc-400">0.0%</span>
            )}
          </div>
        </Card>

        <Card className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">
            {t('compare.latencyDelta')}
          </span>
          <div className="text-xl font-bold font-mono flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-zinc-400" />
            <span className={latencyDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {latencyDelta > 0 ? `+${latencyDelta}ms` : `${latencyDelta}ms`}
            </span>
          </div>
        </Card>

        <Card className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">Total Contratos</span>
          <div className="text-xl font-bold font-mono text-zinc-100">{comparison.length}</div>
        </Card>

        <Card className="space-y-1">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">Status Geral</span>
          <div className="pt-0.5">
            <Badge
              variant={
                head.status === 'pass' ? 'pass' : head.status === 'fail' ? 'fail' : 'warning'
              }
              size="sm"
            >
              {head.status.toUpperCase()}
            </Badge>
          </div>
        </Card>
      </div>

      {/* Per-Contract Comparison Table */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-zinc-100">
          Resultados por Contrato (Side-by-Side)
        </h2>

        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono uppercase text-[10px]">
                  <th className="py-3 px-4">Contrato</th>
                  <th className="py-3 px-4 text-center">Base (Taxa / Lat)</th>
                  <th className="py-3 px-4 text-center">Head (Taxa / Lat)</th>
                  <th className="py-3 px-4 text-center">Variação Taxa</th>
                  <th className="py-3 px-4 text-center">Fingerprint</th>
                  <th className="py-3 px-4 text-center">Prompt Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {comparison.map((item) => {
                  const diff = item.diff;
                  const deltaRate = diff ? diff.pass_rate_delta : 0;

                  return (
                    <tr key={item.slug} className="hover:bg-zinc-900/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-zinc-200">{item.prompt_name}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {item.slug} (v{item.head.contract_version})
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center text-zinc-300">
                        {item.base ? (
                          <span>
                            {item.base.pass_rate}% / {item.base.avg_latency_ms}ms
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center text-zinc-300">
                        <span>
                          {item.head.pass_rate}% / {item.head.avg_latency_ms}ms
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {diff ? (
                          <span
                            className={`font-semibold ${
                              deltaRate > 0
                                ? 'text-emerald-400'
                                : deltaRate < 0
                                  ? 'text-rose-400'
                                  : 'text-zinc-400'
                            }`}
                          >
                            {deltaRate > 0
                              ? `+${deltaRate.toFixed(1)}%`
                              : `${deltaRate.toFixed(1)}%`}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {diff?.fingerprint_changed ? (
                          <Badge variant="warning" size="sm">
                            Alterado
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Igual
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {diff?.prompt_changed ? (
                          <Badge variant="warning" size="sm">
                            Alterado
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Idêntico
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
