import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, FileCode, Play, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { CodeBlock } from '../../components/ui/CodeBlock.js';
import { api } from '../../lib/api-client.js';
import type { Project } from '../../types.js';

export function ProjectOnboarding() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<{ project: Project }>({
    queryKey: ['project', slug],
    queryFn: () => api.get<{ project: Project }>(`/api/v1/projects/${slug}`),
    enabled: Boolean(slug),
  });

  const project = data?.project;

  if (isLoading) {
    return (
      <div className="py-16 text-center text-zinc-500 font-mono text-sm">{t('common.loading')}</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Breadcrumb & Header */}
      <div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('nav.projects')}</span>
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              {t('onboarding.title')}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              {project ? `${project.name} (${project.slug})` : t('onboarding.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to={`/projects/${slug}/contracts`}>
              <Button variant="secondary" size="sm">
                <FileCode className="w-3.5 h-3.5" />
                {t('nav.contracts')}
              </Button>
            </Link>
            <Link to={`/projects/${slug}/runs`}>
              <Button size="sm">
                <Play className="w-3.5 h-3.5" />
                {t('nav.runs')}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Step 1 */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5 text-emerald-400">
          <Terminal className="w-5 h-5" />
          <h2 className="text-base font-semibold text-zinc-100">{t('onboarding.step1')}</h2>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Execute o assistente interativo da CLI na raiz do seu repositório onde os prompts e
          modelos de IA residem. Ele gerará o arquivo{' '}
          <code className="text-zinc-200 font-mono">promptcheck.yaml</code>, um prompt de exemplo e
          o workflow do GitHub Actions com detecção programada de drift.
        </p>
        <CodeBlock code="npx promptcheck scan" language="bash" />
      </Card>

      {/* Step 2 */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          <h2 className="text-base font-semibold text-zinc-100">{t('onboarding.step2')}</h2>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Defina as credenciais seguras no seu arquivo{' '}
          <code className="text-zinc-200 font-mono">.env</code> local ou nos Secrets do repositório
          no CI/CD. O PromptCheck nunca armazena chaves de API nem outputs brutos da LLM no SaaS.
        </p>
        <CodeBlock
          code={`# .env (local) ou GitHub Repository Secrets
PROMPTCHECK_TOKEN=seu_project_token_aqui
OPENAI_API_KEY=sk-proj-...`}
          language="env"
        />
      </Card>

      {/* Step 3 */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5 text-emerald-400">
          <Play className="w-5 h-5" />
          <h2 className="text-base font-semibold text-zinc-100">{t('onboarding.step3')}</h2>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{t('onboarding.step3Desc')}</p>
        <CodeBlock code="npx promptcheck test" language="bash" />
        <p className="text-xs text-zinc-500 italic mt-2">
          Dica: No CI/CD, use flags como{' '}
          <code className="font-mono text-zinc-400">--trigger=ci</code> ou defina o limiar mínimo de
          aprovação com <code className="font-mono text-zinc-400">--fail-under=100</code>.
        </p>
      </Card>

      {/* Action Next */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
        <span className="text-xs text-zinc-500">
          Pronto para cadastrar contratos e casos de teste sintéticos?
        </span>
        <Link to={`/projects/${slug}/contracts`}>
          <Button>
            <span>{t('contracts.newContract')}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
