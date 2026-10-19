import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type CliContractsResponse,
  type RunContractReport,
  type RunReportPayload,
  type RunReportResponse,
  canonicalHash,
} from '@promptcheck/shared';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { collectGitMetadata } from '../git/info.js';
import { setLocale, t } from '../i18n/index.js';
import { OpenAIAdapter } from '../providers/openai.js';
import { generateMarkdownSummary } from '../reporter/markdown.js';
import { printContractResult, printHeader, printSummary } from '../reporter/terminal.js';
import { runContract } from '../runner/contract-runner.js';

export interface TestCommandOptions {
  config?: string;
  failUnder?: string;
  lang?: string;
  only?: string;
  noUpload?: boolean;
  outputMarkdown?: string;
}

export async function runTest(options: TestCommandOptions): Promise<void> {
  setLocale(options.lang);
  printHeader();

  // 1. Carrega e valida promptcheck.yaml
  const { config, configDir } = loadConfig(options.config);

  // 2. Coleta chaves de ambiente
  const token = process.env.PROMPTCHECK_TOKEN;
  if (!token) {
    console.error(pc.red(`\n❌ ${t('tokenMissing')}\n`));
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(pc.red(`\n❌ ${t('apiKeyMissing')}\n`));
    process.exit(1);
  }

  // 3. Busca contratos no SaaS Control Plane
  console.log(pc.gray(`ℹ ${t('fetchingContracts')}`));
  const contractsUrl = new URL('/api/v1/cli/contracts', config.api_url);

  if (options.only) {
    contractsUrl.searchParams.set('slugs', options.only);
  } else {
    const slugs = config.contracts.map((c) => c.slug).join(',');
    contractsUrl.searchParams.set('slugs', slugs);
  }

  let serverData: CliContractsResponse;

  try {
    const response = await fetch(contractsUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const err = (await response.json()) as { error?: { message?: string } };
      console.error(
        pc.red(`\n❌ Erro ao buscar contratos: ${err.error?.message || response.statusText}\n`)
      );
      process.exit(1);
    }

    serverData = (await response.json()) as CliContractsResponse;
  } catch (err) {
    console.error(
      pc.red(`\n❌ Falha na conexão com ${config.api_url}: ${(err as Error).message}\n`)
    );
    process.exit(1);
  }

  // 4. Verificação de Project Mismatch
  if (serverData.project_slug !== config.project) {
    console.error(
      pc.red(
        `\n❌ ${t('projectMismatch', {
          serverProject: serverData.project_slug,
          localProject: config.project,
        })}\n`
      )
    );
    process.exit(1);
  }

  if (serverData.contracts.length === 0) {
    console.log(pc.yellow(`\n⚠ ${t('noContractsFound')}\n`));
    return;
  }

  console.log(pc.cyan(`\n⚡ ${t('runningTests')}\n`));

  const contractMap = new Map(serverData.contracts.map((c) => [c.slug, c]));
  const reports: RunContractReport[] = [];
  const providerAdapter = new OpenAIAdapter();

  const effectiveFailUnder =
    options.failUnder !== undefined ? Number(options.failUnder) : config.defaults.fail_under;

  // 5. Executa cada contrato configurado
  for (const contractConfig of config.contracts) {
    if (options.only && !options.only.split(',').includes(contractConfig.slug)) {
      continue;
    }

    const remoteContract = contractMap.get(contractConfig.slug);
    if (!remoteContract) {
      console.log(
        pc.yellow(`⚠ Contrato "${contractConfig.slug}" não encontrado no SaaS. Pulando...`)
      );
      continue;
    }

    // Lê os arquivos de prompt
    const promptFilePath = resolve(configDir, contractConfig.prompt_file);
    if (!existsSync(promptFilePath)) {
      console.error(pc.red(`❌ Arquivo de prompt não encontrado: ${promptFilePath}`));
      process.exit(1);
    }
    const userPromptTemplate = readFileSync(promptFilePath, 'utf-8');

    let systemPrompt: string | undefined;
    if (contractConfig.system_file) {
      const systemFilePath = resolve(configDir, contractConfig.system_file);
      if (existsSync(systemFilePath)) {
        systemPrompt = readFileSync(systemFilePath, 'utf-8');
      }
    }

    // Calcula prompt_hash canônico
    const model = contractConfig.model || config.defaults.model;
    const provider = contractConfig.provider || config.defaults.provider;
    const temperature = contractConfig.temperature ?? config.defaults.temperature;
    const responseFormat = contractConfig.response_format || config.defaults.response_format;
    const maxTokens = contractConfig.max_tokens ?? config.defaults.max_tokens;
    const baseUrl = contractConfig.base_url || config.defaults.base_url;

    const promptHash = canonicalHash({
      system: systemPrompt || null,
      prompt: userPromptTemplate,
      provider,
      model,
      temperature,
      response_format: responseFormat,
      max_tokens: maxTokens || null,
      base_url: baseUrl || null,
    });

    const report = await runContract({
      contractConfig,
      defaultsConfig: config.defaults,
      schema: remoteContract.json_schema as Record<string, unknown>,
      testCases: remoteContract.test_cases,
      systemPrompt,
      userPromptTemplate,
      promptHash,
      contractVersion: remoteContract.version,
      apiKey,
      providerAdapter,
      pricingTable: serverData.pricing,
      pricingFallback: config.pricing_fallback,
    });

    reports.push(report);
    printContractResult(report);
  }

  // 6. Resumo e Exit Code
  const passed = printSummary(reports, effectiveFailUnder);

  // 7. Envio do relatório de telemetria para o SaaS
  let uploadData: RunReportResponse | undefined;
  const gitMeta = collectGitMetadata();

  if (!options.noUpload && reports.length > 0) {
    const payload: RunReportPayload = {
      project_slug: config.project,
      branch: gitMeta.branch,
      commit_sha: gitMeta.commitSha,
      commit_author: gitMeta.commitAuthor,
      trigger: gitMeta.trigger,
      ci_provider: gitMeta.ciProvider,
      ci_run_url: gitMeta.ciRunUrl,
      cli_version: '0.1.0',
      fail_under: effectiveFailUnder,
      executed_at: new Date().toISOString(),
      contracts: reports,
    };

    const runsUrl = new URL('/api/v1/cli/runs', config.api_url);

    try {
      const uploadRes = await fetch(runsUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (uploadRes.ok) {
        uploadData = (await uploadRes.json()) as RunReportResponse;
        console.log(pc.gray(`\n☁ ${t('uploadSuccess')}`));
        console.log(pc.cyan(`  ${uploadData.dashboard_url}\n`));

        if (uploadData.drift_detected) {
          console.log(pc.yellow(`⚠ ${t('contractDrift')}: verifique os detalhes no dashboard.`));
        }
      } else {
        const err = (await uploadRes.json()) as { error?: { message?: string } };
        console.error(
          pc.yellow(`⚠ Falha ao enviar telemetria: ${err.error?.message || uploadRes.statusText}`)
        );
      }
    } catch (err) {
      console.error(
        pc.yellow(`⚠ Não foi possível conectar ao SaaS para telemetria: ${(err as Error).message}`)
      );
    }
  } else if (options.noUpload) {
    console.log(pc.gray(`ℹ ${t('uploadSkipped')}`));
  }

  // 8. Geração de Resumo em Markdown (GitHub Step Summary & PR Comment)
  const markdown = generateMarkdownSummary({
    projectName: config.project,
    reports,
    failUnder: effectiveFailUnder,
    uploadData,
    branch: gitMeta.branch,
    commitSha: gitMeta.commitSha,
  });

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    } catch {
      // Ignora erro ao escrever step summary no CI
    }
  }

  if (options.outputMarkdown) {
    try {
      writeFileSync(resolve(options.outputMarkdown), markdown, 'utf-8');
      console.log(pc.gray(`📄 Resumo em Markdown gerado em: ${options.outputMarkdown}`));
    } catch (err) {
      console.error(pc.yellow(`⚠ Falha ao gravar Markdown: ${(err as Error).message}`));
    }
  }

  if (!passed) {
    process.exit(1);
  }
}
