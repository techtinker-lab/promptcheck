import { type Assertion, type CaseError, ErrorCodes, resolveJsonPath } from '@promptcheck/shared';

function getType(val: unknown): string {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

/**
 * Avalia uma asserção sobre o JSON parseado da LLM.
 * REQUISITO DE PRIVACIDADE: O erro gerado expõe apenas path, regra violada,
 * tipo esperado e tipo recebido, NUNCA o valor bruto textual.
 */
export function evaluateAssertion(assertion: Assertion, parsedJson: unknown): CaseError | null {
  const actualValue = resolveJsonPath(parsedJson, assertion.path);
  const actualType = getType(actualValue);

  switch (assertion.type) {
    case 'equals': {
      const matches = actualValue === assertion.value;
      if (!matches) {
        return {
          code: ErrorCodes.ASSERTION_FAILED,
          json_path: assertion.path,
          rule_violated: 'equals',
          expected_type: getType(assertion.value),
          received_type: actualType,
        };
      }
      return null;
    }

    case 'not_null': {
      const isNullish = actualValue === null || actualValue === undefined;
      if (isNullish) {
        return {
          code: ErrorCodes.ASSERTION_FAILED,
          json_path: assertion.path,
          rule_violated: 'not_null',
          expected_type: 'non-null',
          received_type: actualType,
        };
      }
      return null;
    }

    case 'contains': {
      if (typeof actualValue !== 'string' || !actualValue.includes(assertion.value)) {
        return {
          code: ErrorCodes.ASSERTION_FAILED,
          json_path: assertion.path,
          rule_violated: 'contains',
          expected_type: 'string',
          received_type: actualType,
        };
      }
      return null;
    }

    case 'regex': {
      let matches = false;
      try {
        const regex = new RegExp(assertion.value);
        matches = typeof actualValue === 'string' && regex.test(actualValue);
      } catch {
        matches = false;
      }

      if (!matches) {
        return {
          code: ErrorCodes.ASSERTION_FAILED,
          json_path: assertion.path,
          rule_violated: 'regex',
          expected_type: 'string',
          received_type: actualType,
        };
      }
      return null;
    }

    case 'in_enum': {
      const isIncluded =
        Array.isArray(assertion.value) &&
        (typeof actualValue === 'string' || typeof actualValue === 'number') &&
        assertion.value.includes(actualValue as never);

      if (!isIncluded) {
        return {
          code: ErrorCodes.ASSERTION_FAILED,
          json_path: assertion.path,
          rule_violated: 'in_enum',
          expected_type: 'enum',
          received_type: actualType,
        };
      }
      return null;
    }

    default:
      return null;
  }
}
