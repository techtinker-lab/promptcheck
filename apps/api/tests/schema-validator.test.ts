import { describe, expect, it } from 'vitest';
import { validateJsonSchemaSyntax } from '../src/services/schema-validator.service.js';

describe('validateJsonSchemaSyntax', () => {
  it('accepts a valid JSON Schema Draft 2020-12', () => {
    const validSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'string' },
        valor: { type: 'number' },
        itens: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['id', 'valor'],
      additionalProperties: false,
    };

    const result = validateJsonSchemaSyntax(validSchema);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects invalid schema structure (e.g. invalid type)', () => {
    const invalidSchema = {
      type: 'invalid_type_here',
    };

    const result = validateJsonSchemaSyntax(invalidSchema);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects non-object schemas', () => {
    expect(validateJsonSchemaSyntax('not an object').valid).toBe(false);
    expect(validateJsonSchemaSyntax(null).valid).toBe(false);
    expect(validateJsonSchemaSyntax([1, 2, 3]).valid).toBe(false);
  });
});
