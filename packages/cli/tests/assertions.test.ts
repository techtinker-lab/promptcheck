import { describe, expect, it } from 'vitest';
import { evaluateAssertion } from '../src/runner/assertions.js';

describe('CLI Deterministic Assertions & Privacy', () => {
  const sampleJson = {
    categoria: 'FINANCEIRO',
    total: 100.5,
    status: 'PAGO',
    descricao: 'Pagamento de fatura mensal',
    codigo: 'ABC-123',
    observacao: null,
  };

  it('evaluates "equals" assertion properly without exposing raw values on error', () => {
    const passAssertion = {
      type: 'equals' as const,
      path: '$.categoria',
      value: 'FINANCEIRO',
    };
    expect(evaluateAssertion(passAssertion, sampleJson)).toBeNull();

    const failAssertion = {
      type: 'equals' as const,
      path: '$.categoria',
      value: 'FISCAL',
    };
    const error = evaluateAssertion(failAssertion, sampleJson);
    expect(error).not.toBeNull();
    expect(error?.rule_violated).toBe('equals');
    expect(error?.json_path).toBe('$.categoria');
    expect(error?.expected_type).toBe('string');
    expect(error?.received_type).toBe('string');
    // Garante que o valor confidencial 'FINANCEIRO' não foi incluído no erro
    expect(JSON.stringify(error)).not.toContain('FINANCEIRO');
  });

  it('evaluates "not_null" assertion properly', () => {
    expect(evaluateAssertion({ type: 'not_null', path: '$.total' }, sampleJson)).toBeNull();

    const failError = evaluateAssertion({ type: 'not_null', path: '$.observacao' }, sampleJson);
    expect(failError).not.toBeNull();
    expect(failError?.received_type).toBe('null');
  });

  it('evaluates "contains" assertion properly', () => {
    expect(
      evaluateAssertion({ type: 'contains', path: '$.descricao', value: 'fatura' }, sampleJson)
    ).toBeNull();

    expect(
      evaluateAssertion({ type: 'contains', path: '$.descricao', value: 'boleto' }, sampleJson)
    ).not.toBeNull();
  });

  it('evaluates "regex" assertion properly', () => {
    expect(
      evaluateAssertion({ type: 'regex', path: '$.codigo', value: '^[A-Z]{3}-\\d{3}$' }, sampleJson)
    ).toBeNull();

    expect(
      evaluateAssertion({ type: 'regex', path: '$.codigo', value: '^\\d+$' }, sampleJson)
    ).not.toBeNull();
  });

  it('evaluates "in_enum" assertion properly', () => {
    expect(
      evaluateAssertion(
        { type: 'in_enum', path: '$.status', value: ['PAGO', 'PENDENTE', 'CANCELADO'] },
        sampleJson
      )
    ).toBeNull();

    expect(
      evaluateAssertion(
        { type: 'in_enum', path: '$.status', value: ['PROCESSANDO', 'FALHA'] },
        sampleJson
      )
    ).not.toBeNull();
  });
});
