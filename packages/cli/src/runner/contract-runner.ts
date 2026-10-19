import type {
  CaseError,
  CaseResult,
  PricingTable,
  RunContractReport,
  TestCase,
} from '@promptcheck/shared';
import { ErrorCodes } from '@promptcheck/shared';
import addFormats from 'ajv-formats';
import _Ajv2020 from 'ajv/dist/2020.js';
import type { ContractConfig, DefaultsConfig, ResponseFormat } from '../config/schema.js';
import type { ProviderAdapter } from '../providers/types.js';
import { evaluateAssertion } from './assertions.js';
import { runConcurrent } from './concurrency.js';

// Setup Ajv para validação local na CLI
const AjvConstructor = (_Ajv2020 as unknown as { default?: typeof _Ajv2020 }).default || _Ajv2020;
// @ts-expect-error - constructor typing
const ajv = new AjvConstructor({ allErrors: true, strict: false });
const addFormatsFn =
  (addFormats as unknown as { default?: typeof addFormats }).default || addFormats;
// @ts-expect-error - formats invocation
addFormatsFn(ajv);

export interface RunContractOptions {
  contractConfig: ContractConfig;
  defaultsConfig: DefaultsConfig;
  schema: Record<string, unknown>;
  testCases: TestCase[];
  systemPrompt?: string | undefined;
  userPromptTemplate: string;
  promptHash: string;
  contractVersion: number;
  apiKey: string;
  providerAdapter: ProviderAdapter;
  pricingTable: PricingTable;
  pricingFallback?: Record<string, { input_per_1m: number; output_per_1m: number }> | undefined;
}

/**
 * Interpola variáveis {{chave}} no template do prompt a partir dos inputs do caso de teste
 */
export function interpolatePrompt(
  template: string,
  input: Record<string, unknown>
): {
  result: string;
  missingVariables: string[];
} {
  const missing: string[] = [];
  const interpolated = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (input[key] === undefined || input[key] === null) {
      missing.push(key);
      return '';
    }
    const val = input[key];
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });

  return { result: interpolated, missingVariables: missing };
}

/**
 * Mapeia erros do Ajv para o formato restrito CaseError sem vazar valores
 */
export function mapAjvErrors(errors: unknown[]): CaseError[] {
  return (
    errors as { instancePath?: string; keyword?: string; params?: Record<string, unknown> }[]
  ).map((err) => {
    const jsonPath = err.instancePath ? `$${err.instancePath.replace(/\//g, '.')}` : '$';
    const ruleViolated = err.keyword || 'schema';
    const expectedType = String(err.params?.type || ruleViolated);

    return {
      code: ErrorCodes.SCHEMA_TYPE_MISMATCH,
      json_path: jsonPath,
      rule_violated: ruleViolated,
      expected_type: expectedType,
      received_type: 'unknown',
    };
  });
}

/**
 * Executa todos os casos de teste de um contrato
 */
export async function runContract(options: RunContractOptions): Promise<RunContractReport> {
  const {
    contractConfig,
    defaultsConfig,
    schema,
    testCases,
    systemPrompt,
    userPromptTemplate,
    promptHash,
    contractVersion,
    apiKey,
    providerAdapter,
    pricingTable,
    pricingFallback,
  } = options;

  const model = contractConfig.model || defaultsConfig.model;
  const provider = contractConfig.provider || defaultsConfig.provider;
  const temperature = contractConfig.temperature ?? defaultsConfig.temperature;
  const maxTokens = contractConfig.max_tokens ?? defaultsConfig.max_tokens;
  const responseFormat = (contractConfig.response_format ||
    defaultsConfig.response_format) as ResponseFormat;
  const timeoutMs = contractConfig.timeout_ms ?? defaultsConfig.timeout_ms;
  const retries = contractConfig.retries ?? defaultsConfig.retries;
  const baseUrl = contractConfig.base_url || defaultsConfig.base_url;
  const concurrency = defaultsConfig.concurrency;

  let compiledValidator: ((data: unknown) => boolean) | null = null;
  try {
    compiledValidator = ajv.compile(schema) as (data: unknown) => boolean;
  } catch {
    // Se o schema for inválido, compiledValidator será nulo
  }

  let capturedFingerprint: string | null = null;

  const caseResults = await runConcurrent(
    testCases,
    concurrency,
    async (testCase): Promise<CaseResult> => {
      const errors: CaseError[] = [];

      // 1. Interpolação de variáveis
      const { result: userPrompt, missingVariables } = interpolatePrompt(
        userPromptTemplate,
        testCase.input
      );
      if (missingVariables.length > 0) {
        return {
          case_id: testCase.id,
          status: 'fail',
          latency_ms: 0,
          input_tokens: 0,
          output_tokens: 0,
          errors: [
            {
              code: ErrorCodes.TEMPLATE_VARIABLE_MISSING,
              json_path: '$',
              rule_violated: 'interpolation',
              expected_type: missingVariables.join(', '),
              received_type: 'undefined',
            },
          ],
        };
      }

      // 2. Chamada ao provedor de IA
      let rawOutput = '';
      let latencyMs = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const response = await providerAdapter.call({
          systemPrompt,
          userPrompt,
          model,
          temperature,
          maxTokens,
          responseFormat,
          jsonSchema: schema,
          contractSlug: contractConfig.slug,
          baseUrl,
          apiKey,
          timeoutMs,
          retries,
        });

        rawOutput = response.rawContent;
        latencyMs = response.latencyMs;
        inputTokens = response.inputTokens;
        outputTokens = response.outputTokens;
        if (response.systemFingerprint) {
          capturedFingerprint = response.systemFingerprint;
        }
      } catch (err) {
        return {
          case_id: testCase.id,
          status: 'fail',
          latency_ms: 0,
          input_tokens: 0,
          output_tokens: 0,
          errors: [
            {
              code: ErrorCodes.PROVIDER_ERROR,
              json_path: '$',
              rule_violated: 'provider_call',
              expected_type: 'response',
              received_type: 'error',
            },
          ],
        };
      }

      // 3. Parse determinístico do JSON retornado
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawOutput);
      } catch {
        return {
          case_id: testCase.id,
          status: 'fail',
          latency_ms: latencyMs,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          errors: [
            {
              code: ErrorCodes.SCHEMA_VALIDATION_FAILED,
              json_path: '$',
              rule_violated: 'json_syntax',
              expected_type: 'valid_json',
              received_type: 'malformed_string',
            },
          ],
        };
      }

      // 4. Validação do JSON Schema com Ajv
      if (compiledValidator) {
        const isValid = compiledValidator(parsedJson);
        if (!isValid && (compiledValidator as unknown as { errors?: unknown[] }).errors) {
          const ajvErrors = mapAjvErrors(
            (compiledValidator as unknown as { errors: unknown[] }).errors
          );
          errors.push(...ajvErrors);
        }
      }

      // 5. Avaliação de Asserções Determinísticas
      if (testCase.assertions && Array.isArray(testCase.assertions)) {
        for (const assertion of testCase.assertions) {
          const assertionErr = evaluateAssertion(assertion, parsedJson);
          if (assertionErr) {
            errors.push(assertionErr);
          }
        }
      }

      return {
        case_id: testCase.id,
        status: errors.length === 0 ? 'pass' : 'fail',
        latency_ms: latencyMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        errors,
      };
    }
  );

  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((r) => r.status === 'pass').length;
  const failedCases = totalCases - passedCases;
  const passRate = totalCases > 0 ? Number(((passedCases / totalCases) * 100).toFixed(2)) : 0;
  const avgLatencyMs =
    totalCases > 0
      ? Math.round(caseResults.reduce((acc, r) => acc + r.latency_ms, 0) / totalCases)
      : 0;
  const totalInputTokens = caseResults.reduce((acc, r) => acc + r.input_tokens, 0);
  const totalOutputTokens = caseResults.reduce((acc, r) => acc + r.output_tokens, 0);

  // Cálculo de Custo em USD
  const pricingEntry = pricingTable.models[model] || pricingFallback?.[model];
  let costUsd = 0;
  let costEstimated = false;

  if (pricingEntry) {
    costUsd =
      (totalInputTokens / 1_000_000) * pricingEntry.input_per_1m +
      (totalOutputTokens / 1_000_000) * pricingEntry.output_per_1m;
  } else {
    costEstimated = false;
  }

  return {
    slug: contractConfig.slug,
    contract_version: contractVersion,
    provider,
    model,
    system_fingerprint: capturedFingerprint,
    prompt_hash: promptHash,
    total_cases: totalCases,
    passed_cases: passedCases,
    failed_cases: failedCases,
    pass_rate: passRate,
    avg_latency_ms: avgLatencyMs,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd: Number(costUsd.toFixed(6)),
    cost_estimated: costEstimated,
    case_results: caseResults,
  };
}
