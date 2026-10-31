import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type CliContractItem,
  type CliContractsResponse,
  type CliSyncContractItem,
  DEFAULT_PRICING_TABLE,
  type PricingTable,
  type RunContractReport,
  type RunReportPayload,
  type RunReportResponse,
  type TestCase,
  canonicalHash,
} from '@promptcheck/shared';
import pc from 'picocolors';
import YAML from 'yaml';
import { loadConfig } from '../config/loader.js';
import type { ContractConfig } from '../config/schema.js';
import { collectGitMetadata } from '../git/info.js';
import { setLocale, t } from '../i18n/index.js';
import { OpenAIAdapter } from '../providers/openai.js';
import { generateMarkdownSummary } from '../reporter/markdown.js';
import { printContractResult, printHeader, printSummary } from '../reporter/terminal.js';
import { runContract } from '../runner/contract-runner.js';
import { evaluateAndSaveLocalDrift } from '../runner/local-baseline.js';
import { extractLivePromptFromSource } from '../scanner/code-scanner.js';

export interface TestCommandOptions {
  config?: string;
  failUnder?: string;
  lang?: string;
  only?: string;
  noUpload?: boolean;
  outputMarkdown?: string;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function resolveLocalTestCases(contractConfig: ContractConfig, configDir: string): TestCase[] {
  const rawCases = [...(contractConfig.cases || [])];

  if (contractConfig.local_cases) {
    const casesPath = resolve(configDir, contractConfig.local_cases);
    if (existsSync(casesPath)) {
      const content = readFileSync(casesPath, 'utf-8');
      const parsed = casesPath.endsWith('.json') ? JSON.parse(content) : YAML.parse(content);
      if (Array.isArray(parsed)) {
        rawCases.push(...parsed);
      }
    }
  }

  return rawCases.map((tc, idx) => ({
    id: tc.id || `tc_${contractConfig.slug.replace(/[^a-z0-9]/g, '_')}_${idx + 1}`,
    name: tc.name,
    ...(tc.description !== undefined ? { description: tc.description } : {}),
    input: tc.input,
    assertions: tc.assertions || [],
  }));
}

export async function runTest(options: TestCommandOptions): Promise<void> {
  setLocale(options.lang);
  printHeader();

  // 1. Carrega e valida promptcheck.yaml (e carrega .env / .env.local automaticamente)
  const { config, configDir } = loadConfig(options.config);

  // 2. Coleta chaves de ambiente
  const token = process.env.PROMPTCHECK_TOKEN;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error(pc.red(`\n❌ ${t('apiKeyMissing')}\n`));
    process.exit(1);
  }

  const hasInlineContracts = config.contracts.some(
    (c) => Boolean(c.schema) && (Boolean(c.cases?.length) || Boolean(c.local_cases))
  );

  if (!token && !hasInlineContracts) {
    console.error(pc.red(`\n❌ ${t('tokenMissing')}\n`));
    process.exit(1);
  }

  const contractMap = new Map<string, CliContractItem>();
  let pricingTable: PricingTable = DEFAULT_PRICING_TABLE;
  let canUploadToSaas = Boolean(token && !options.noUpload);

  // 3. Se houver token, sincroniza contratos locais (Contract-as-Code) e busca contratos do SaaS
  if (token) {
    const syncableContracts: CliSyncContractItem[] = config.contracts
      .filter((c) => Boolean(c.schema))
      .map((c) => ({
        slug: c.slug,
        prompt_name: c.name || humanizeSlug(c.slug),
        ...(c.description ? { description: c.description } : {}),
        json_schema: c.schema as Record<string, unknown>,
        test_cases: resolveLocalTestCases(c, configDir),
      }));

    if (syncableContracts.length > 0 && !options.noUpload) {
      try {
        const syncUrl = new URL('/api/v1/cli/sync', config.api_url);
        const syncRes = await fetch(syncUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          body: JSON.stringify({ contracts: syncableContracts }),
        });

        if (syncRes.ok) {
          console.log(
            pc.gray(
              `🔄 Contract-as-Code: ${syncableContracts.length} contrato(s) sincronizado(s) automaticamente com o SaaS.`
            )
          );
        }
      } catch {
        // Ignora silenciosamente se endpoint de sync não estiver disponível; tentará GET /contracts ou fallback local
      }
    }

    console.log(pc.gray(`ℹ ${t('fetchingContracts')}`));
    const contractsUrl = new URL('/api/v1/cli/contracts', config.api_url);

    if (options.only) {
      contractsUrl.searchParams.set('slugs', options.only);
    } else {
      const slugs = config.contracts.map((c) => c.slug).join(',');
      contractsUrl.searchParams.set('slugs', slugs);
    }

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
        if (!hasInlineContracts) {
          console.error(
            pc.red(`\n❌ Erro ao buscar contratos: ${err.error?.message || response.statusText}\n`)
          );
          process.exit(1);
        }
        console.log(
          pc.yellow(
            `⚠ Aviso SaaS (${err.error?.message || response.statusText}). Usando contratos inline do promptcheck.yaml...`
          )
        );
        canUploadToSaas = false;
      } else {
        const serverData = (await response.json()) as CliContractsResponse;

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

        pricingTable = serverData.pricing;
        for (const c of serverData.contracts) {
          contractMap.set(c.slug, c);
        }
      }
    } catch (err) {
      if (!hasInlineContracts) {
        console.error(
          pc.red(`\n❌ Falha na conexão com ${config.api_url}: ${(err as Error).message}\n`)
        );
        process.exit(1);
      }
      console.log(
        pc.yellow(
          `⚠ SaaS offline (${config.api_url}). Executando em modo local (Contract-as-Code)...`
        )
      );
      canUploadToSaas = false;
    }
  } else {
    console.log(
      pc.cyan('ℹ Executando em modo local Zero-Config (Contract-as-Code no promptcheck.yaml)...')
    );
  }

  // Fallback para contratos definidos inline no promptcheck.yaml
  for (const contractConfig of config.contracts) {
    if (!contractMap.has(contractConfig.slug) && contractConfig.schema) {
      contractMap.set(contractConfig.slug, {
        slug: contractConfig.slug,
        prompt_name: contractConfig.name || humanizeSlug(contractConfig.slug),
        version: 1,
        json_schema: contractConfig.schema,
        test_cases: resolveLocalTestCases(contractConfig, configDir),
      });
    }
  }

  if (contractMap.size === 0) {
    console.log(pc.yellow(`\n⚠ ${t('noContractsFound')}\n`));
    return;
  }

  console.log(pc.cyan(`\n⚡ ${t('runningTests')}\n`));

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
        pc.yellow(`⚠ Contrato "${contractConfig.slug}" não encontrado. Pulando...`)
      );
      continue;
    }

    // Resolve prompt do usuário (source_file direto do código, inline ou prompt_file)
    let userPromptTemplate: string;
    if (contractConfig.source_file) {
      const sourceFilePath = resolve(configDir, contractConfig.source_file);
      if (!existsSync(sourceFilePath)) {
        console.error(pc.red(`❌ Arquivo de código-fonte não encontrado: ${sourceFilePath}`));
        process.exit(1);
      }
      userPromptTemplate = extractLivePromptFromSource(sourceFilePath);
      console.log(pc.gray(`  🔗 Lendo prompt ao vivo de: ${contractConfig.source_file}`));
    } else if (contractConfig.prompt) {
      userPromptTemplate = contractConfig.prompt;
    } else if (contractConfig.prompt_file) {
      const promptFilePath = resolve(configDir, contractConfig.prompt_file);
      if (!existsSync(promptFilePath)) {
        console.error(pc.red(`❌ Arquivo de prompt não encontrado: ${promptFilePath}`));
        process.exit(1);
      }
      userPromptTemplate = readFileSync(promptFilePath, 'utf-8');
    } else {
      console.error(pc.red(`❌ Contrato "${contractConfig.slug}" sem prompt configurado.`));
      process.exit(1);
    }

    // Resolve system prompt (inline ou arquivo)
    let systemPrompt: string | undefined;
    if (contractConfig.system) {
      systemPrompt = contractConfig.system;
    } else if (contractConfig.system_file) {
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
      pricingTable,
      pricingFallback: config.pricing_fallback,
    });

    reports.push(report);
    printContractResult(report);
  }

  // 6. Resumo e Exit Code + Baseline Local (Standalone Open Source Drift Detection)
  const localDriftEvaluations = evaluateAndSaveLocalDrift(
    configDir,
    config.project,
    reports
  );
  const localDriftItems = localDriftEvaluations.filter((e) => e.driftReasons.length > 0);
  if (localDriftItems.length > 0) {
    console.log(pc.yellow(`\n⚠ ${t('contractDrift')} (baseline local .promptcheck/baseline.json):`));
    for (const item of localDriftItems) {
      console.log(
        pc.yellow(`  • ${item.slug}: ${item.driftReasons.join(', ')}`)
      );
    }
  }

  const passed = printSummary(reports, effectiveFailUnder);

  // 7. Envio do relatório de telemetria para o SaaS
  let uploadData: RunReportResponse | undefined;
  const gitMeta = collectGitMetadata();

  if (canUploadToSaas && token && reports.length > 0) {
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
