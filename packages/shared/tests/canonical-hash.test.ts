import { describe, expect, it } from 'vitest';
import { canonicalHash, canonicalJson } from '../src/utils/canonical-hash.js';

describe('canonicalHash and canonicalJson', () => {
  it('sorts keys deterministically regardless of insertion order', () => {
    const objA = { b: 2, a: 1, c: { z: 9, y: 8 } };
    const objB = { a: 1, c: { y: 8, z: 9 }, b: 2 };

    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalHash(objA)).toBe(canonicalHash(objB));
    expect(canonicalJson(objA)).toBe('{"a":1,"b":2,"c":{"y":8,"z":9}}');
  });

  it('normalizes CRLF to LF in strings', () => {
    const windowsText = { prompt: 'Linha 1\r\nLinha 2\r\n' };
    const unixText = { prompt: 'Linha 1\nLinha 2\n' };

    expect(canonicalJson(windowsText)).toBe(canonicalJson(unixText));
    expect(canonicalHash(windowsText)).toBe(canonicalHash(unixText));
  });

  it('generates a 64-character SHA-256 hex string', () => {
    const hash = canonicalHash({ test: 'value' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
