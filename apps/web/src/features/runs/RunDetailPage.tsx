import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  GitBranch,
  GitCommit,
  ShieldCheck,
  Terminal,
  User,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.js';
import { Card } from '../../components/ui/Card.js';
import { CopyButton } from '../../components/ui/CopyButton.js';
import { api } from '../../lib/api-client.js';
import type { Project, RunContractResultEntity, TestRunEntity } from '../../types.js';

export function RunDetailPage() {
  const { slug, runId } = useParams<{ slug: string; runId: string }>();
  const { t } = useTranslation();

  // 1. Fetch Project
  const { data: projectData } = useQuery<{ project: Project }>({
    queryKey: ['project', slug],
    queryFn: () => api.get<{ project: Project }>(`/api/v1/projects/${slug}`),
    enabled: Boolean(slug),
  });

  const project = projectData?.project;

  // 2. Fetch Run details
  const { data, isLoading, error } = useQuery<{
    run: TestRunEntity;
    contract_results: RunContractResultEntity[];
  }>({
    queryKey: ['run', slug, runId],
    queryFn: () =>
      api.get<{ run: TestRunEntity; contract_results: RunContractResultEntity[] }>(
        `/api/v1/projects/${slug}/runs/${runId}`
      ),
    enabled: Boolean(slug && runId),
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center text-zinc-500 font-mono text-sm">{t('common.loading')}</div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center text-rose-400 font-mono text-sm">
        Execução não encontrada ou erro ao carregar detalhes.
      </div>
    );
  }

  const { run, contract_results } = data;
  const passRate =
    run.totalCases > 0 ? ((run.passedCases / run.totalCases) * 100).toFixed(1) : '100.0';

  const getStatusBadge = (status: 'pass' | 'fail' | 'warning') => {
    if (status === 'pass') {
      return (
        <Badge variant="pass" size="md" className="gap-1.5 px-3 py-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Pass
        </Badge>
      );
    }
    if (status === 'fail') {
      return (
        <Badge variant="fail" size="md" className="gap-1.5 px-3 py-1">
          <XCircle className="w-4 h-4 text-rose-400" />
          Fail
        </Badge>
      );
    }
    return (
      <Badge variant="warning" size="md" className="gap-1.5 px-3 py-1">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        Drift Alert
      </Badge>
    );
  };

  const getDriftReasonLabel = (reason: string) => {
    switch (reason) {
      case 'FINGERPRINT_CHANGED':
        return 'System Fingerprint Alterado';
      case 'PASS_RATE_DROPPED':
        return 'Queda na Taxa de Sucesso';
      case 'LATENCY_INCREASED':
        return 'Latência Aumentada (> 150%)';
      default:
        return reason;
    }
  };

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
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              {t('runDetail.title')}
            </h1>
            {getStatusBadge(run.status)}
            <Badge variant="neutral" size="sm">
              {project?.slug || slug}
            </Badge>
          </div>

          <div className="text-xs text-zinc-400 font-mono">
            {new Date(run.executedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'medium',
            })}
          </div>
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="space-y-1">
          <span className="text-xs font-mono text-zinc-400 block uppercase">
            {t('runs.passRate')}
          </span>
          <div className="text-2xl font-bold font-mono text-zinc-100 flex items-baseline gap-2">
            <span>{passRate}%</span>
            <span className="text-xs text-zinc-500 font-normal">
              ({run.passedCases}/{run.totalCases})
            </span>
          </div>
        </Card>

        <Card className="space-y-1">
          <span className="text-xs font-mono text-zinc-400 block uppercase">
            {t('runs.latency')}
          </span>
          <div className="text-2xl font-bold font-mono text-zinc-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <span>{run.avgLatencyMs}ms</span>
          </div>
        </Card>

        <Card className="space-y-1">
          <span className="text-xs font-mono text-zinc-400 block uppercase">{t('runs.cost')}</span>
          <div className="text-2xl font-bold font-mono text-zinc-100 flex items-center gap-1">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>${Number(run.totalCostUsd).toFixed(4)}</span>
          </div>
        </Card>

        <Card className="space-y-1">
          <span className="text-xs font-mono text-zinc-400 block uppercase">Gatilho & CLI</span>
          <div className="text-sm font-semibold font-mono text-zinc-200 truncate flex items-center gap-1.5 pt-1">
            <Terminal className="w-4 h-4 text-zinc-400" />
            <span>{run.trigger}</span>
            <span className="text-xs text-zinc-500">({run.cliVersion})</span>
          </div>
        </Card>
      </div>

      {/* Git & CI Metadata Card */}
      <Card className="bg-zinc-950/60 text-xs font-mono space-y-3">
        <div className="text-zinc-400 font-semibold uppercase text-[10px] tracking-wider">
          Metadados de Execução (LGPD Compliant)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-zinc-300">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-zinc-500" />
            <span>Branch:</span>
            <strong className="text-zinc-100">{run.branch}</strong>
          </div>

          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-zinc-500" />
            <span>Commit:</span>
            <span className="text-emerald-400">{run.commitSha.slice(0, 8)}</span>
            <CopyButton textToCopy={run.commitSha} />
          </div>

          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-zinc-500" />
            <span>Autor:</span>
            <strong className="text-zinc-100">{run.commitAuthor || 'CLI'}</strong>
          </div>

          {run.ciRunUrl ? (
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-zinc-500" />
              <a
                href={run.ciRunUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1 truncate"
              >
                CI Pipeline Run
              </a>
            </div>
          ) : (
            <div className="text-zinc-500">Executado localmente</div>
          )}
        </div>
      </Card>

      {/* Contracts Execution Results */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-lg font-bold text-zinc-100">
            {t('runDetail.contracts')} ({contract_results.length})
          </h2>
        </div>

        <div className="space-y-6">
          {contract_results.map((cr) => {
            const hasDrift = cr.drift_reasons && cr.drift_reasons.length > 0;
            const failedCases = cr.case_results.filter((c) => c.status === 'fail');

            return (
              <Card key={cr.id} className="space-y-4">
                {/* Contract Summary Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-zinc-100">{cr.prompt_name}</h3>
                      <Badge variant="neutral" size="sm">
                        v{cr.contract_version}
                      </Badge>
                      {getStatusBadge(cr.status)}
                    </div>
                    <div className="text-xs font-mono text-zinc-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        slug: <strong className="text-zinc-200">{cr.contract_slug}</strong>
                      </span>
                      <span>
                        modelo: <strong className="text-zinc-200">{cr.model}</strong>
                      </span>
                      <span>
                        provedor: <strong className="text-zinc-200">{cr.provider}</strong>
                      </span>
                      {cr.system_fingerprint && (
                        <span>
                          fp: <strong className="text-zinc-200">{cr.system_fingerprint}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono self-end md:self-center">
                    <div className="text-right">
                      <span className="text-zinc-500 block text-[10px]">TAXA DE SUCESSO</span>
                      <span className="font-bold text-zinc-200">{cr.pass_rate}%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-500 block text-[10px]">LATÊNCIA MÉDIA</span>
                      <span className="font-bold text-zinc-200">{cr.avg_latency_ms}ms</span>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-500 block text-[10px]">TOKENS (IN/OUT)</span>
                      <span className="font-bold text-zinc-200">
                        {cr.input_tokens}/{cr.output_tokens}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Drift Alert Banner if present */}
                {hasDrift && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/80 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{t('runDetail.driftReasons')}:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cr.drift_reasons.map((reason) => (
                        <Badge key={reason} variant="warning" size="sm">
                          {getDriftReasonLabel(reason)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed Cases Diff Table (Privacy-Preserving) */}
                {failedCases.length > 0 ? (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        {t('runDetail.errors')} ({failedCases.length})
                      </h4>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Privacy by Design: nenhum dado de cliente ou texto da LLM é armazenado
                      </span>
                    </div>

                    <div className="border border-zinc-800 rounded-md overflow-hidden bg-zinc-950/80">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono uppercase text-[10px]">
                            <th className="py-2 px-3">Caso</th>
                            <th className="py-2 px-3">{t('runDetail.jsonPath')}</th>
                            <th className="py-2 px-3">{t('runDetail.ruleViolated')}</th>
                            <th className="py-2 px-3">{t('runDetail.expectedType')}</th>
                            <th className="py-2 px-3">{t('runDetail.receivedType')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 font-mono">
                          {failedCases.flatMap((fc) =>
                            fc.errors.map((err, errIdx) => (
                              <tr key={`${fc.case_id}-${errIdx}`} className="hover:bg-zinc-900/30">
                                <td className="py-2 px-3 text-zinc-300">{fc.case_id}</td>
                                <td className="py-2 px-3 text-emerald-400">
                                  {err.json_path || '$'}
                                </td>
                                <td className="py-2 px-3 text-rose-400 font-semibold">
                                  {err.rule_violated}
                                </td>
                                <td className="py-2 px-3 text-zinc-300">{err.expected_type}</td>
                                <td className="py-2 px-3 text-amber-400">{err.received_type}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-zinc-950/40 rounded-md border border-zinc-800/60 flex items-center gap-2 text-xs text-emerald-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Todos os casos passaram perfeitamente sem violação de contrato.</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
