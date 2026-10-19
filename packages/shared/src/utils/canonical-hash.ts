import { createHash } from 'node:crypto';

/**
 * Normaliza quebras de linha CRLF para LF recursivamente.
 */
function normalizeLineEndings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\r\n/g, '\n');
  }

  if (Array.isArray(value)) {
    return value.map(normalizeLineEndings);
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = normalizeLineEndings(v);
    }
    return result;
  }

  return value;
}

/**
 * Converte qualquer objeto para uma string JSON determinística com chaves ordenadas
 * e quebras de linha normalizadas (CRLF -> LF).
 */
export function canonicalJson(obj: unknown): string {
  const normalized = normalizeLineEndings(obj);

  function sort(val: unknown): unknown {
    if (val === null || typeof val !== 'object') {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map(sort);
    }

    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).sort();

    for (const key of keys) {
      const v = (val as Record<string, unknown>)[key];
      if (v !== undefined) {
        sortedObj[key] = sort(v);
      }
    }

    return sortedObj;
  }

  return JSON.stringify(sort(normalized));
}

/**
 * Calcula o hash SHA-256 canônico em hexadecimal (64 caracteres).
 */
export function canonicalHash(obj: unknown): string {
  const json = canonicalJson(obj);
  return createHash('sha256').update(json).digest('hex');
}
