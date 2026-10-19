import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  GitBranch,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { CopyButton } from '../../components/ui/CopyButton.js';
import { api } from '../../lib/api-client.js';
import type { Project, ProjectCreatedResponse, RotateTokenResponse } from '../../types.js';

export function ProjectsListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdData, setCreatedData] = useState<ProjectCreatedResponse | null>(null);

  const [rotateProject, setRotateProject] = useState<Project | null>(null);
  const [rotatedData, setRotatedData] = useState<RotateTokenResponse | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [driftTolerance, setDriftTolerance] = useState(5);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => api.get<{ projects: Project[] }>('/api/v1/projects'),
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      name: string;
      slug: string;
      default_branch: string;
      drift_pass_rate_tolerance: number;
    }) => api.post<ProjectCreatedResponse>('/api/v1/projects', body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setCreatedData(res);
      setIsCreateOpen(false);
      setName('');
      setSlug('');
      setDefaultBranch('main');
      setDriftTolerance(5);
      setFormError(null);
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar projeto');
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (projectId: string) =>
      api.post<RotateTokenResponse>(`/api/v1/projects/${projectId}/token/rotate`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setRotatedData(res);
      setRotateProject(null);
    },
  });

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      );
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      slug: slug.trim(),
      default_branch: defaultBranch.trim() || 'main',
      drift_pass_rate_tolerance: Number(driftTolerance),
    });
  };

  const projects = data?.projects || [];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{t('projects.title')}</h1>
          <p className="text-sm text-zinc-400 mt-1">{t('projects.subtitle')}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="sm:self-start">
          <Plus className="w-4 h-4" />
          {t('projects.newProject')}
        </Button>
      </div>

      {/* Loading & Empty states */}
      {isLoading ? (
        <div className="py-16 text-center text-zinc-500 font-mono text-sm">
          {t('common.loading')}
        </div>
      ) : projects.length === 0 ? (
        <Card className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-400 mb-4">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-zinc-200">{t('projects.title')}</h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mt-1 mb-6">
            {t('projects.noProjects')}
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            {t('projects.newProject')}
          </Button>
        </Card>
      ) : (
        /* Projects Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="flex flex-col justify-between hover:border-zinc-700 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-base font-semibold text-zinc-100 truncate">{project.name}</h3>
                  <Badge variant="neutral" size="sm">
                    <GitBranch className="w-3 h-3 mr-1" />
                    {project.default_branch}
                  </Badge>
                </div>

                <div className="text-xs font-mono text-zinc-400 mb-4">
                  slug: <span className="text-zinc-200">{project.slug}</span>
                </div>

                {/* Token and Settings */}
                <div className="space-y-2 text-xs bg-zinc-950/60 border border-zinc-800/80 rounded p-2.5 mb-4">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>{t('projects.tokenPrefix')}:</span>
                    <span className="font-mono text-zinc-300">{project.token_prefix}...</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>{t('projects.driftTolerance')}:</span>
                    <span className="font-mono text-zinc-300">
                      {project.drift_pass_rate_tolerance}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setRotateProject(project)}
                  className="text-xs text-zinc-400 hover:text-amber-400 flex items-center gap-1 font-mono transition-colors"
                  title={t('projects.rotateToken')}
                >
                  <RefreshCw className="w-3 h-3" />
                  {t('projects.rotateToken')}
                </button>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/projects/${project.slug}/contracts`}
                    className="text-xs font-medium text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                  >
                    {t('nav.contracts')}
                  </Link>
                  <Link
                    to={`/projects/${project.slug}/runs`}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/60 hover:bg-emerald-900/40 transition-colors"
                  >
                    {t('nav.runs')}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL: Create Project */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 shadow-2xl">
            <h2 className="text-lg font-bold text-zinc-100 mb-1">{t('projects.newProject')}</h2>
            <p className="text-xs text-zinc-400 mb-4">{t('projects.subtitle')}</p>

            {formError && (
              <div className="mb-4 p-2.5 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="project-name"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  {t('projects.name')}
                </label>
                <input
                  id="project-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Meu Sistema IA"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>

              <div>
                <label
                  htmlFor="project-slug"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  {t('projects.slug')}
                </label>
                <input
                  id="project-slug"
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="meu-sistema-ia"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="project-default-branch"
                    className="block text-xs font-medium text-zinc-300 mb-1"
                  >
                    {t('projects.defaultBranch')}
                  </label>
                  <input
                    id="project-default-branch"
                    type="text"
                    value={defaultBranch}
                    onChange={(e) => setDefaultBranch(e.target.value)}
                    placeholder="main"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="project-drift-tolerance"
                    className="block text-xs font-medium text-zinc-300 mb-1"
                  >
                    {t('projects.driftTolerance')}
                  </label>
                  <input
                    id="project-drift-tolerance"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={driftTolerance}
                    onChange={(e) => setDriftTolerance(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" isLoading={createMutation.isPending}>
                  {t('common.create')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Project Created with Token */}
      {createdData && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <KeyRound className="w-5 h-5" />
              <h2 className="text-lg font-bold text-zinc-100">Projeto Criado com Sucesso!</h2>
            </div>

            {/* Warning Notice */}
            <div className="p-3 rounded bg-amber-950/40 border border-amber-800/80 flex items-start gap-2.5 text-amber-300 text-xs leading-relaxed">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{t('projects.tokenNotice')}</span>
            </div>

            {/* Token Display with CopyButton */}
            <div>
              <div className="block text-xs font-medium text-zinc-400 mb-1 font-mono">
                PROMPTCHECK_TOKEN:
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 bg-zinc-950 border border-zinc-800 rounded-md font-mono text-xs text-emerald-400 break-all select-all">
                <span>{createdData.project_token}</span>
                <CopyButton textToCopy={createdData.project_token} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              <Link
                to={`/projects/${createdData.project.slug}/onboarding`}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5"
                onClick={() => setCreatedData(null)}
              >
                <span>{t('onboarding.title')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Button onClick={() => setCreatedData(null)}>OK</Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL: Rotate Token Confirmation */}
      {rotateProject && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-base font-bold text-zinc-100">{t('projects.rotateToken')}</h2>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">{t('projects.confirmRotate')}</p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <Button variant="ghost" onClick={() => setRotateProject(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                isLoading={rotateMutation.isPending}
                onClick={() => rotateMutation.mutate(rotateProject.id)}
              >
                {t('projects.rotateToken')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL: Rotated Token Display */}
      {rotatedData && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <RefreshCw className="w-5 h-5" />
              <h2 className="text-lg font-bold text-zinc-100">Novo Token Gerado!</h2>
            </div>

            <div className="p-3 rounded bg-amber-950/40 border border-amber-800/80 flex items-start gap-2.5 text-amber-300 text-xs leading-relaxed">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{t('projects.tokenNotice')}</span>
            </div>

            <div>
              <div className="block text-xs font-medium text-zinc-400 mb-1 font-mono">
                PROMPTCHECK_TOKEN:
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 bg-zinc-950 border border-zinc-800 rounded-md font-mono text-xs text-emerald-400 break-all select-all">
                <span>{rotatedData.project_token}</span>
                <CopyButton textToCopy={rotatedData.project_token} />
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
              <Button onClick={() => setRotatedData(null)}>OK</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
