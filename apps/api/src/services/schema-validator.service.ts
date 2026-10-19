import type { Options } from 'ajv';
import _addFormats from 'ajv-formats';
import _Ajv2020 from 'ajv/dist/2020.js';

interface AjvInstance {
  validateSchema: (schema: unknown) => boolean;
  errors?: unknown[] | null;
  errorsText: (errors?: unknown[] | null) => string;
  compile: (schema: unknown) => unknown;
}

type AjvConstructor = new (opts?: Options) => AjvInstance;

const AjvClass =
  (_Ajv2020 as unknown as { default?: AjvConstructor }).default ||
  (_Ajv2020 as unknown as AjvConstructor);

const ajv = new AjvClass({
  strict: false,
  allErrors: true,
});

const addFormatsFn =
  (_addFormats as unknown as { default?: (instance: unknown) => void }).default ||
  (_addFormats as unknown as (instance: unknown) => void);

addFormatsFn(ajv);

/**
 * Valida se um objeto JSON representa um JSON Schema válido (Draft 2020-12).
 * Compila o schema para garantir que não haja erros de sintaxe ou referências inválidas.
 */
export function validateJsonSchemaSyntax(schemaObj: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof schemaObj !== 'object' || schemaObj === null || Array.isArray(schemaObj)) {
    return { valid: false, error: 'O JSON Schema deve ser um objeto válido' };
  }

  try {
    const isSchemaValid = ajv.validateSchema(schemaObj);
    if (!isSchemaValid) {
      const errorText = ajv.errorsText(ajv.errors);
      return { valid: false, error: errorText };
    }

    // Tenta compilar para garantir integridade estrutural
    ajv.compile(schemaObj);
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na compilação do JSON Schema';
    return { valid: false, error: message };
  }
}
