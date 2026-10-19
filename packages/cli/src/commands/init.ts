import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pc from 'picocolors';
import { setLocale, t } from '../i18n/index.js';

const SAMPLE_YAML = `# ==============================================================================
# PromptCheck Configuration
# ATENÇÃO: NUNCA insira tokens ou chaves de API neste arquivo.
# Tokens devem ser fornecidos exclusivamente via variáveis de ambiente:
# - PROMPTCHECK_TOKEN
# - OPENAI_API_KEY
# ==============================================================================

version: 1
project: "meu-sistema-ia" # Alinhe com o slug do projeto cadastrado no SaaS

defaults:
  provider: "openai"
  model: "gpt-4o-mini"
  temperature: 0.0
  response_format: "json_object" # json_object | json_schema
  concurrency: 5 # Requisições concorrentes
  fail_under: 100 # % mínima de sucesso para exit code 0
  timeout_ms: 30000
  retries: 3

contracts:
  - slug: "extrator-nota-fiscal"
    prompt_file: "./src/prompts/extrator-nf.txt"
    model: "gpt-4o-mini"
`;

const SAMPLE_PROMPT = `Você é um extrator de dados de notas fiscais.
Extraia os dados da nota fiscal a seguir e retorne estritamente um objeto JSON contendo:
- numero_nota (string)
- valor_total (number)
- categoria (string: FINANCEIRO, FISCAL ou OUTROS)

Texto da nota:
{{texto}}
`;

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

export async function runInit(options: { lang?: string }): Promise<void> {
  setLocale(options.lang);

  const yamlPath = resolve('promptcheck.yaml');
  const gitignorePath = resolve('.gitignore');
  const workflowDir = resolve('.github/workflows');
  const workflowPath = resolve(workflowDir, 'promptcheck.yml');
  const promptDir = resolve('src/prompts');
  const promptPath = resolve(promptDir, 'extrator-nf.txt');

  // 1. Cria promptcheck.yaml
  if (!existsSync(yamlPath)) {
    writeFileSync(yamlPath, SAMPLE_YAML, 'utf-8');
    console.log(pc.green(`✓ ${t('initSuccess')}`));
  } else {
    console.log(pc.yellow('ℹ promptcheck.yaml já existe (ignorado)'));
  }

  // 2. Cria arquivo de prompt de exemplo
  if (!existsSync(promptPath)) {
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(promptPath, SAMPLE_PROMPT, 'utf-8');
    console.log(pc.green('✓ Exemplo de prompt criado em src/prompts/extrator-nf.txt'));
  }

  // 3. Cria GitHub Actions workflow
  if (!existsSync(workflowPath)) {
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(workflowPath, GITHUB_WORKFLOW, 'utf-8');
    console.log(pc.green(`✓ ${t('initWorkflowCreated')}`));
  }

  // 4. Garante que .env está no .gitignore
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

  console.log(pc.cyan(`\n${t('initInstructions')}\n`));
}
