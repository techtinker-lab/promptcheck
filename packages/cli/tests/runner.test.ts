import { describe, expect, it } from 'vitest';
import { runConcurrent } from '../src/runner/concurrency.js';
import { interpolatePrompt, mapAjvErrors } from '../src/runner/contract-runner.js';

describe('CLI Runner Utilities', () => {
  it('interpolates template variables accurately', () => {
    const template = 'Analise a nota {{numero_nota}} do cliente {{cliente}}: {{texto}}';
    const input = {
      numero_nota: '12345',
      cliente: 'TechTinker',
      texto: 'Serviço prestado no valor de R$ 500',
    };

    const { result, missingVariables } = interpolatePrompt(template, input);
    expect(result).toBe(
      'Analise a nota 12345 do cliente TechTinker: Serviço prestado no valor de R$ 500'
    );
    expect(missingVariables).toHaveLength(0);
  });

  it('detects missing template variables', () => {
    const template = 'Analise a nota {{numero_nota}} e {{campo_faltante}}';
    const input = {
      numero_nota: '12345',
    };

    const { missingVariables } = interpolatePrompt(template, input);
    expect(missingVariables).toContain('campo_faltante');
  });

  it('maps Ajv errors without leaking values', () => {
    const rawAjvErrors = [
      {
        instancePath: '/valor_total',
        keyword: 'type',
        params: { type: 'number' },
      },
    ];

    const mapped = mapAjvErrors(rawAjvErrors);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.json_path).toBe('$.valor_total');
    expect(mapped[0]?.rule_violated).toBe('type');
    expect(mapped[0]?.expected_type).toBe('number');
  });

  it('executes tasks concurrently and maintains result order', async () => {
    const items = [10, 20, 30, 40, 50];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const results = await runConcurrent(items, 2, async (item) => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return item * 2;
    });

    expect(results).toEqual([20, 40, 60, 80, 100]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
