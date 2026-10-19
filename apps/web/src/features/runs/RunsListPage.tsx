import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCode,
  GitBranch,
  GitCommit,
  GitCompare,
  Play,
  User,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { api } from '../../lib/api-client.js';
import type { Project, TestRunEntity } from '../../types.js';

export function RunsListPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  // 1. Fetch Project
  const { data: projectData } = useQuery<{ project: Project }>({
    queryKey: ['project', slug],
    queryFn: () => api.get<{ project: Project }>(`/api/v1/projects/${slug}`),
    enabled: Boolean(slug),
  });

  const project = projectData?.project;

  // 2. Fetch Runs
  const { data: runsData, isLoading } = useQuery<{ runs: TestRunEntity[] }>({
    queryKey: ['runs', slug, selectedBranch, selectedStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedBranch) params.append('branch', selectedBranch);
      if (selectedStatus) params.append('status', selectedStatus);
      return api.get<{ runs: TestRunEntity[] }>(
        `/api/v1/projects/${slug}/runs?${params.toString()}`
      );
    },
    enabled: Boolean(slug),
  });

  const runs = runsData?.runs || [];

  const handleSelectRun = (id: string) => {
    if (selectedRunIds.includes(id)) {
      setSelectedRunIds(selectedRunIds.filter((item) => item !== id));
    } else {
      if (selectedRunIds.length >= 2) {
        // Keeps the last one and adds new
        const second = selectedRunIds[1];
        setSelectedRunIds(second ? [second, id] : [id]);
      } else {
        setSelectedRunIds([...selectedRunIds, id]);
      }
    }
  };

  const handleCompareClick = () => {
    if (selectedRunIds.length === 2) {
      navigate(`/projects/${slug}/compare?base=${selectedRunIds[0]}&head=${selectedRunIds[1]}`);
    }
  };

  const getStatusBadge = (status: 'pass' | 'fail' | 'warning') => {
    if (status === 'pass') {
      return (
        <Badge variant="pass" size="sm" className="gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          Pass
        </Badge>
      );
    }
    if (status === 'fail') {
      return (
        <Badge variant="fail" size="sm" className="gap-1">
          <XCircle className="w-3 h-3 text-rose-400" />
          Fail
        </Badge>
      );
    }
    return (
      <Badge variant="warning" size="sm" className="gap-1">
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        Drift
      </Badge>
    );
  };

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb & Header */}
      <div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('nav.projects')}</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{t('runs.title')}</h1>
              {project && (
                <Badge variant="neutral" size="sm">
                  {project.slug}
                </Badge>
              )}
            </div>
            <p className="text-sm text-zinc-400 mt-1">{t('runs.subtitle')}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link to={`/projects/${slug}/contracts`}>
              <Button variant="secondary" size="sm">
                <FileCode className="w-3.5 h-3.5" />
                {t('nav.contracts')}
              </Button>
            </Link>
            {selectedRunIds.length === 2 && (
              <Button size="sm" onClick={handleCompareClick}>
                <GitCompare className="w-3.5 h-3.5" />
                {t('runs.compare')} (2)
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-zinc-950/60 border border-zinc-800 p-3 rounded-lg text-xs">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-mono">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 font-mono focus:outline-none"
          >
            <option value="">Todos</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="warning">Drift Alert</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-mono">Branch:</span>
          <input
            type="text"
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            placeholder="main"
            className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 font-mono focus:outline-none w-32"
          />
        </div>

        {selectedRunIds.length > 0 && (
          <div className="ml-auto text-zinc-400 text-xs font-mono flex items-center gap-2">
            <span>{selectedRunIds.length} de 2 selecionadas para comparação</span>
            <button
              type="button"
              onClick={() => setSelectedRunIds([])}
              className="text-zinc-500 hover:text-zinc-300 underline"
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* Runs Table */}
      {isLoading ? (
        <div className="py-16 text-center text-zinc-500 font-mono text-sm">
          {t('common.loading')}
        </div>
      ) : runs.length === 0 ? (
        <Card className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-400 mb-4">
            <Play className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-zinc-200">{t('runs.title')}</h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mt-1 mb-6">{t('runs.noRuns')}</p>
          <Link to={`/projects/${slug}/onboarding`}>
            <Button>{t('onboarding.title')}</Button>
          </Link>
        </Card>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 font-mono uppercase text-[10px]">
                  <th className="py-3 px-4 w-10 text-center">#</th>
                  <th className="py-3 px-4">{t('runs.status')}</th>
                  <th className="py-3 px-4">{t('runs.branch')}</th>
                  <th className="py-3 px-4">{t('runs.commit')}</th>
                  <th className="py-3 px-4">{t('runs.author')}</th>
                  <th className="py-3 px-4 text-right">Casos</th>
                  <th className="py-3 px-4 text-right">{t('runs.passRate')}</th>
                  <th className="py-3 px-4 text-right">{t('runs.latency')}</th>
                  <th className="py-3 px-4 text-right">{t('runs.cost')}</th>
                  <th className="py-3 px-4 text-right">{t('runs.executedAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {runs.map((run) => {
                  const isChecked = selectedRunIds.includes(run.id);
                  const passRate =
                    run.totalCases > 0
                      ? ((run.passedCases / run.totalCases) * 100).toFixed(1)
                      : '100.0';

                  return (
                    <tr
                      key={run.id}
                      className={`hover:bg-zinc-900/40 transition-colors ${
                        isChecked ? 'bg-zinc-900/60' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectRun(run.id)}
                          className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <Link
                          to={`/projects/${slug}/runs/${run.id}`}
                          className="hover:underline inline-block"
                        >
                          {getStatusBadge(run.status)}
                        </Link>
                      </td>

                      <td className="py-3 px-4 text-zinc-300">
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-zinc-500" />
                          {run.branch}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-zinc-400">
                        <span className="flex items-center gap-1 font-mono">
                          <GitCommit className="w-3 h-3 text-zinc-500" />
                          {run.commitSha.slice(0, 7)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-zinc-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-500" />
                          {run.commitAuthor || 'CLI'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right text-zinc-300">
                        {run.passedCases}/{run.totalCases}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-semibold ${
                            Number(passRate) === 100
                              ? 'text-emerald-400'
                              : Number(passRate) >= 80
                                ? 'text-amber-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {passRate}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right text-zinc-300">{run.avgLatencyMs}ms</td>

                      <td className="py-3 px-4 text-right text-zinc-400">
                        ${Number(run.totalCostUsd).toFixed(4)}
                      </td>

                      <td className="py-3 px-4 text-right text-zinc-500">
                        <Link
                          to={`/projects/${slug}/runs/${run.id}`}
                          className="hover:text-emerald-400 transition-colors"
                        >
                          {new Date(run.executedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
