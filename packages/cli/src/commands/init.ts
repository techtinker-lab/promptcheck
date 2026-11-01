import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, parse, relative, resolve } from 'node:path';
import type { CliBootstrapResponse } from '@promptcheck/shared';
import pc from 'picocolors';
import YAML from 'yaml';
import { loadLocalEnvFiles } from '../config/loader.js';
import { setLocale, t } from '../i18n/index.js';
import {
  type GeneratedContractSpec,
  inferContractFromCodeWithAI,
  scanRepositoryForAiFiles,
} from '../scanner/code-scanner.js';

export interface InitCommandOptions {
  lang?: string;
  force?: boolean;
  apiUrl?: string;
}

const GITHUB_WORKFLOW = `name: PromptCheck Contract Testing & Drift Detection

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  # Monitoramento de Drift diário (independente de PRs/commits)
  schedule:
    - cron: '0 6 * * *' # Executa todo dia às 06:00 UTC

jobs:
  contract-test:
    name: Prompt Contracts & Drift Verification
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run PromptCheck
        env:
          PROMPTCHECK_TOKEN: \${{ secrets.PROMPTCHECK_TOKEN }}
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
        run: npx @techtinker/promptcheck test --fail-under 90
`;

/**
 * Encontra a raiz real do projeto (onde está package.json ou .git)
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  const { root } = parse(current);

  while (true) {
    if (existsSync(resolve(current, 'package.json')) || existsSync(resolve(current, '.git'))) {
      return current;
    }
    if (current === root) {
      return resolve(startDir);
    }
    current = dirname(current);
  }
}

function toKebabSlug(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length >= 2 ? cleaned.slice(0, 80) : 'meu-sistema-ia';
}

function discoverPromptFiles(projectRoot: string): string[] {
  const found: string[] = [];
  const candidateDirs = [
    resolve(projectRoot, 'src/ai/prompts'),
    resolve(projectRoot, 'src/prompts'),
    resolve(projectRoot, 'prompts'),
  ];

  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isFile() && (entry.endsWith('.txt') || entry.endsWith('.md'))) {
          found.push(`./${relative(projectRoot, full).replace(/\\/g, '/')}`);
        }
      }
    } catch {
      // ignora erro de leitura
    }
  }

  return found;
}

function buildPlugAndPlayYaml(
  projectSlug: string,
  apiUrl: string,
  autoDiscoveredContracts: GeneratedContractSpec[],
  discoveredTxtFiles: string[]
): string {
  const header = `# ==============================================================================
# PromptCheck Configuration — Zero-Maintenance (Live Code Binding)
# - Cada contrato usa "source_file" apontando direto para o código-fonte real!
# - Quando você altera o prompt no código (.ts / .js / .py), o PromptCheck lê a
#   nova versão automaticamente sem precisar duplicar nem editar este arquivo.
# ==============================================================================
`;

  let contractsList: Record<string, unknown>[] = [];

  if (autoDiscoveredContracts.length > 0) {
    contractsList = autoDiscoveredContracts.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      source_file: c.source_file,
      model: c.model,
      response_format: c.response_format,
      schema: c.schema,
      cases: c.cases,
    }));
  } else {
    const promptFileEntry = discoveredTxtFiles.find((f) => !f.includes('system'));
    const systemFileEntry = discoveredTxtFiles.find((f) => f.includes('system'));

    const contractObj: Record<string, unknown> = {
      slug: `${projectSlug}-core`,
      name: `${projectSlug.toUpperCase()} — Contrato Principal`,
      description: 'Validação estrutural de JSON e regras determinísticas do prompt',
      model: 'gpt-4o-mini',
      response_format: 'json_object',
    };

    if (systemFileEntry) {
      contractObj.system_file = systemFileEntry;
    }
    if (promptFileEntry) {
      contractObj.prompt_file = promptFileEntry;
    } else {
      contractObj.prompt = [
        'Analise a solicitação abaixo e retorne ESTRITAMENTE um objeto JSON contendo:',
        '- "categoria": string ("SUPORTE", "FINANCEIRO" ou "COMERCIAL")',
        '- "urgente": boolean',
        '- "resumo": string curta descrevendo a ação recomendada',
        '',
        'Solicitação: "{{mensagem}}"',
      ].join('\n');
    }

    contractObj.schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        categoria: { type: 'string', enum: ['SUPORTE', 'FINANCEIRO', 'COMERCIAL'] },
        urgente: { type: 'boolean' },
        resumo: { type: 'string', minLength: 3 },
      },
      required: ['categoria', 'urgente', 'resumo'],
      additionalProperties: false,
    };

    contractObj.cases = [
      {
        id: 'tc_1',
        name: 'Caso Sintético 1 — Cobrança Duplicada',
        input: {
          mensagem: 'Recebi duas cobranças no cartão de crédito e preciso de estorno imediato.',
        },
        assertions: [
          { type: 'equals', path: '$.categoria', value: 'FINANCEIRO' },
          { type: 'equals', path: '$.urgente', value: true },
        ],
      },
    ];

    contractsList = [contractObj];
  }

  const doc = {
    version: 1,
    project: projectSlug,
    api_url: apiUrl,
    defaults: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.0,
      response_format: 'json_object',
      concurrency: 5,
      fail_under: 100,
      timeout_ms: 30000,
      retries: 2,
    },
    contracts: contractsList,
  };

  return `${header}\n${YAML.stringify(doc)}`;
}

function upsertEnvVar(envPath: string, key: string, value: string): void {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    content = `${content}${prefix}${key}=${value}\n`;
  }
  writeFileSync(envPath, content, 'utf-8');
}

export async function runInit(options: InitCommandOptions): Promise<void> {
  setLocale(options.lang);

  // 1. Localiza a raiz real do projeto
  const projectRoot = findProjectRoot(process.cwd());
  loadLocalEnvFiles(projectRoot);

  const folderName = basename(projectRoot);
  let projectName = folderName;
  const pkgPath = resolve(projectRoot, 'package.json');

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        name?: string;
        scripts?: Record<string, string>;
      };
      if (pkg.name) {
        projectName = pkg.name;
      }
    } catch {
      // ignora erro de parse do package.json
    }
  }

  const projectSlug = toKebabSlug(folderName || projectName);
  const yamlPath = resolve(projectRoot, 'promptcheck.yaml');
  const gitignorePath = resolve(projectRoot, '.gitignore');
  const workflowDir = resolve(projectRoot, '.github/workflows');
  const workflowPath = resolve(workflowDir, 'promptcheck.yml');

  // 2. Detecta se o Control Plane local (http://localhost:3333) está ativo
  let targetApiUrl =
    options.apiUrl ||
    process.env.PROMPTCHECK_API_URL ||
    'https://api.promptcheck.techtinker.com.br';
  let localServerActive = false;

  try {
    const checkUrl = options.apiUrl || process.env.PROMPTCHECK_API_URL || 'http://localhost:3333';
    const healthRes = await fetch(new URL('/healthz', checkUrl).toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    if (healthRes.ok) {
      targetApiUrl = checkUrl;
      localServerActive = true;
    }
  } catch {
    // Servidor local não detectado; mantém URL padrão
  }

  // 3. Auto-Discovery de prompts diretamente nos arquivos de código (.ts, .js, .py)
  if (!existsSync(yamlPath) || options.force) {
    console.log(pc.cyan('\n🔎 Escaneando repositório em busca de prompts e chamadas de IA...'));
    const aiSourceFiles = scanRepositoryForAiFiles(projectRoot);
    const discoveredTxtFiles = discoverPromptFiles(projectRoot);
    let generatedContracts: GeneratedContractSpec[] = [];

    if (aiSourceFiles.length > 0) {
      for (const f of aiSourceFiles) {
        console.log(pc.green(`  ✓ Descoberto no código: ${f.relativePath} → [${f.suggestedSlug}]`));
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        console.log(
          pc.cyan(
            `🤖 Gerando JSON Schemas e casos de teste sintéticos automaticamente para ${aiSourceFiles.length} arquivo(s)...`
          )
        );
        generatedContracts = await Promise.all(
          aiSourceFiles.map((file) => inferContractFromCodeWithAI(file, apiKey))
        );
      } else {
        generatedContracts = aiSourceFiles.map((file) => ({
          slug: file.suggestedSlug,
          name: `Contrato — ${file.suggestedSlug}`,
          description: `Contrato vinculado automaticamente ao arquivo ${file.relativePath}`,
          source_file: file.relativePath,
          model: 'gpt-4o-mini',
          response_format: 'json_object',
          schema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
          },
          cases: [
            {
              id: `tc_${file.suggestedSlug.replace(/-/g, '_')}_1`,
              name: 'Validação Estrutural de JSON',
              input: { input: 'Gere uma resposta estruturada em JSON para validação de contrato.' },
              assertions: [],
            },
          ],
        }));
      }
    }

    const yamlContent = buildPlugAndPlayYaml(
      projectSlug,
      targetApiUrl,
      generatedContracts,
      discoveredTxtFiles
    );
    writeFileSync(yamlPath, yamlContent, 'utf-8');
    console.log(
      pc.green(
        `✓ ${t('initSuccess')} (${generatedContracts.length || 1} contrato(s) configurado(s) em promptcheck.yaml)`
      )
    );
  } else {
    console.log(
      pc.yellow(
        'ℹ promptcheck.yaml já existe na raiz do projeto (use "promptcheck scan" ou "promptcheck init --force" para reescanear o código)'
      )
    );
  }

  // 4. Auto-Provisioning (Bootstrap) no Control Plane se estiver acessível
  if (localServerActive) {
    try {
      const bootstrapRes = await fetch(new URL('/api/v1/cli/bootstrap', targetApiUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_slug: projectSlug,
          project_name: projectName,
          default_branch: 'main',
        }),
      });

      if (bootstrapRes.ok) {
        const data = (await bootstrapRes.json()) as CliBootstrapResponse;
        const envFile = existsSync(resolve(projectRoot, '.env.local'))
          ? resolve(projectRoot, '.env.local')
          : resolve(projectRoot, '.env');

        upsertEnvVar(envFile, 'PROMPTCHECK_TOKEN', data.project_token);
        upsertEnvVar(envFile, 'PROMPTCHECK_API_URL', targetApiUrl);
        process.env.PROMPTCHECK_TOKEN = data.project_token;
        process.env.PROMPTCHECK_API_URL = targetApiUrl;

        console.log(
          pc.green(
            `✓ Projeto "${data.project_slug}" provisionado automaticamente e token salvo em ${basename(envFile)}!`
          )
        );
      }
    } catch {
      // Se falhar bootstrap automático, segue normalmente
    }
  }

  // 5. Adiciona script "promptcheck" no package.json se existir
  if (existsSync(pkgPath)) {
    try {
      const pkgRaw = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
      if (!pkg.scripts) pkg.scripts = {};
      if (!pkg.scripts.promptcheck) {
        pkg.scripts.promptcheck = 'promptcheck test';
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
        console.log(pc.green('✓ Script "npm run promptcheck" adicionado ao package.json'));
      }
    } catch {
      // Ignora caso não consiga atualizar package.json
    }
  }

  // 6. Cria GitHub Actions workflow na raiz do projeto
  if (!existsSync(workflowPath)) {
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(workflowPath, GITHUB_WORKFLOW, 'utf-8');
    console.log(pc.green(`✓ ${t('initWorkflowCreated')}`));
  }

  // 7. Garante que .env está no .gitignore
  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    if (!gitignoreContent.includes('.env')) {
      writeFileSync(gitignorePath, `${gitignoreContent.trim()}\n.env\n.env.*\n`, 'utf-8');
      console.log(pc.green(`✓ ${t('initGitignoreUpdated')}`));
    }
  } else {
    writeFileSync(gitignorePath, '.env\n.env.*\nnode_modules/\n', 'utf-8');
    console.log(pc.green('✓ .gitignore criado com proteção para .env'));
  }

  const hasToken = Boolean(process.env.PROMPTCHECK_TOKEN);
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);

  console.log(pc.cyan('\n📋 Status do Ambiente:'));
  console.log(
    hasToken
      ? pc.green('  ✓ PROMPTCHECK_TOKEN configurado automaticamente')
      : pc.yellow(
          '  ⚠ PROMPTCHECK_TOKEN ausente (adicione no .env.local para sincronizar com o SaaS)'
        )
  );
  console.log(
    hasOpenAiKey
      ? pc.green('  ✓ OPENAI_API_KEY detectada no ambiente')
      : pc.yellow('  ⚠ OPENAI_API_KEY ausente (adicione no .env.local antes de rodar os testes)')
  );
  console.log(pc.cyan('\n🚀 Para rodar os testes agora, execute:'));
  console.log(
    `${pc.bold(pc.green('  promptcheck test'))}${pc.gray('  (ou: npm run promptcheck)\n')}`
  );
}
