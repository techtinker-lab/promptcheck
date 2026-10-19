import type { RunContractReport } from '@promptcheck/shared';
import { describe, expect, it } from 'vitest';
import { generateMarkdownSummary } from '../src/reporter/markdown.js';

describe('Markdown Reporter (PR Commenter & CI Step Summary)', () => {
  const sampleReports: RunContractReport[] = [
    {
      slug: 'classificador-suporte',
      contract_version: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt_hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      system_fingerprint: 'fp_44709d6fcb',
      total_cases: 2,
      passed_cases: 2,
      failed_cases: 0,
      pass_rate: 100,
      avg_latency_ms: 180,
      input_tokens: 150,
      output_tokens: 40,
      cost_usd: 0.0001,
      cost_estimated: false,
      case_results: [
        {
          case_id: 'tc_1',
          status: 'pass',
          latency_ms: 170,
          input_tokens: 75,
          output_tokens: 20,
          errors: [],
        },
        {
          case_id: 'tc_2',
          status: 'pass',
          latency_ms: 190,
          input_tokens: 75,
          output_tokens: 20,
          errors: [],
        },
      ],
    },
  ];

  it('generates passing markdown report with tables', () => {
    const md = generateMarkdownSummary({
      projectName: 'meu-sistema',
      reports: sampleReports,
      failUnder: 100,
      uploadData: {
        run_id: '123e4567-e89b-12d3-a456-426614174000',
        dashboard_url: 'https://promptcheck.techtinker.com.br/projects/meu-sistema/runs/run-999',
        drift_detected: false,
        status: 'pass',
        contracts: [
          {
            slug: 'classificador-suporte',
            status: 'pass',
            pass_rate: 100,
            drift_reasons: [],
          },
        ],
      },
      branch: 'main',
      commitSha: 'a1b2c3d4e5f6',
    });

    expect(md).toContain('## 🛡️ PromptCheck Test Report — `meu-sistema`');
    expect(md).toContain('✅ **PASSED**');
    expect(md).toContain('`classificador-suporte`');
    expect(md).toContain('https://promptcheck.techtinker.com.br/projects/meu-sistema/runs/run-999');
    expect(md).not.toContain('Alerta de Model Drift Detectado');
  });

  it('includes drift warning when drift is detected', () => {
    const md = generateMarkdownSummary({
      projectName: 'meu-sistema',
      reports: sampleReports,
      failUnder: 100,
      uploadData: {
        run_id: '123e4567-e89b-12d3-a456-426614174000',
        dashboard_url: 'https://promptcheck.techtinker.com.br/projects/meu-sistema/runs/run-1000',
        drift_detected: true,
        status: 'warning',
        contracts: [
          {
            slug: 'classificador-suporte',
            status: 'warning',
            pass_rate: 100,
            drift_reasons: ['FINGERPRINT_CHANGED'],
          },
        ],
      },
    });

    expect(md).toContain('⚠️ **DRIFT ALERT**');
    expect(md).toContain('### ⚠️ Alerta de Model Drift Detectado');
  });

  it('includes privacy-preserving error diffs when cases fail', () => {
    const baseReport = sampleReports[0];
    expect(baseReport).toBeDefined();
    if (!baseReport) return;

    const failedReport: RunContractReport = {
      ...baseReport,
      passed_cases: 1,
      failed_cases: 1,
      pass_rate: 50,
      case_results: [
        {
          case_id: 'tc_fail',
          status: 'fail',
          latency_ms: 200,
          input_tokens: 80,
          output_tokens: 25,
          errors: [
            {
              code: 'SCHEMA_TYPE_MISMATCH',
              json_path: '$.categoria',
              rule_violated: 'type',
              expected_type: 'string',
              received_type: 'number',
            },
          ],
        },
      ],
    };

    const md = generateMarkdownSummary({
      projectName: 'meu-sistema',
      reports: [failedReport],
      failUnder: 100,
    });

    expect(md).toContain('❌ **FAILED**');
    expect(md).toContain('### ❌ Violações de Contrato');
    expect(md).toContain('`$.categoria`');
    expect(md).toContain(
      'Privacy by Design: Valores em texto puro e outputs da LLM nunca são expostos em relatórios.'
    );
  });
});
