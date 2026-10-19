import { describe, expect, it } from 'vitest';
import { AssertionSchema } from '../src/schemas/assertions.js';
import { CreateContractInputSchema } from '../src/schemas/contract.js';
import { CreateProjectInputSchema } from '../src/schemas/project.js';
import { RunReportPayloadSchema } from '../src/schemas/telemetry.js';

describe('Zod Strict Schemas', () => {
  it('rejects extra unrecognized fields in CreateProjectInput', () => {
    const valid = {
      name: 'Meu Projeto',
      slug: 'meu-projeto',
      default_branch: 'main',
      drift_pass_rate_tolerance: 5,
    };
    expect(CreateProjectInputSchema.safeParse(valid).success).toBe(true);

    const withExtra = {
      ...valid,
      extra_field: 'illegal',
    };
    expect(CreateProjectInputSchema.safeParse(withExtra).success).toBe(false);
  });

  it('validates Assertion types and rejects invalid assertion', () => {
    const equalsAssertion = {
      type: 'equals',
      path: '$.status',
      value: 'PAGO',
    };
    expect(AssertionSchema.safeParse(equalsAssertion).success).toBe(true);

    const invalidAssertion = {
      type: 'unknown_type',
      path: '$.status',
    };
    expect(AssertionSchema.safeParse(invalidAssertion).success).toBe(false);
  });

  it('validates a valid RunReportPayload', () => {
    const payload = {
      project_slug: 'extrator-nf',
      branch: 'feature/prompt-update',
      commit_sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      commit_author: 'rafael',
      trigger: 'push',
      ci_provider: 'github_actions',
      ci_run_url: 'https://github.com/techtinker/promptcheck/actions/runs/123456',
      cli_version: '0.1.0',
      fail_under: 95,
      executed_at: new Date().toISOString(),
      contracts: [
        {
          slug: 'extrator-nota-fiscal',
          contract_version: 1,
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_fingerprint: 'fp_123456',
          prompt_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          total_cases: 2,
          passed_cases: 2,
          failed_cases: 0,
          pass_rate: 100,
          avg_latency_ms: 450,
          input_tokens: 300,
          output_tokens: 120,
          cost_usd: 0.0001,
          cost_estimated: false,
          case_results: [
            {
              case_id: 'tc_1',
              status: 'pass',
              latency_ms: 400,
              input_tokens: 150,
              output_tokens: 60,
              errors: [],
            },
            {
              case_id: 'tc_2',
              status: 'pass',
              latency_ms: 500,
              input_tokens: 150,
              output_tokens: 60,
              errors: [],
            },
          ],
        },
      ],
    };

    const result = RunReportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects RunReportPayload containing extra unknown fields (strict mode)', () => {
    const payloadWithLeak = {
      project_slug: 'extrator-nf',
      branch: 'main',
      commit_sha: 'a1b2c3d',
      cli_version: '0.1.0',
      executed_at: new Date().toISOString(),
      contracts: [],
      raw_llm_output: 'conteudo confidencial', // Violação de privacidade
    };

    const result = RunReportPayloadSchema.safeParse(payloadWithLeak);
    expect(result.success).toBe(false);
  });
});
