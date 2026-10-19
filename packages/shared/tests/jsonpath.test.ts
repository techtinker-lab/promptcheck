import { describe, expect, it } from 'vitest';
import { resolveJsonPath } from '../src/utils/jsonpath.js';

describe('resolveJsonPath', () => {
  const sample = {
    categoria: 'FINANCEIRO',
    total: 1500.5,
    cliente: {
      nome: 'TechTinker',
      contato: {
        email: 'dev@techtinker.com.br',
      },
    },
    itens: [
      { id: 1, descricao: 'Servidor', preco: 1000 },
      { id: 2, descricao: 'Domínio', preco: 50.5 },
    ],
  };

  it('resolves root ($) correctly', () => {
    expect(resolveJsonPath(sample, '$')).toEqual(sample);
  });

  it('resolves direct properties', () => {
    expect(resolveJsonPath(sample, '$.categoria')).toBe('FINANCEIRO');
    expect(resolveJsonPath(sample, '$.total')).toBe(1500.5);
  });

  it('resolves nested properties', () => {
    expect(resolveJsonPath(sample, '$.cliente.nome')).toBe('TechTinker');
    expect(resolveJsonPath(sample, '$.cliente.contato.email')).toBe('dev@techtinker.com.br');
  });

  it('resolves array indexing and nested properties inside array elements', () => {
    expect(resolveJsonPath(sample, '$.itens[0].descricao')).toBe('Servidor');
    expect(resolveJsonPath(sample, '$.itens[1].preco')).toBe(50.5);
  });

  it('returns undefined for non-existent properties or out of bounds index', () => {
    expect(resolveJsonPath(sample, '$.nao_existe')).toBeUndefined();
    expect(resolveJsonPath(sample, '$.itens[99]')).toBeUndefined();
    expect(resolveJsonPath(null, '$.categoria')).toBeUndefined();
  });
});
