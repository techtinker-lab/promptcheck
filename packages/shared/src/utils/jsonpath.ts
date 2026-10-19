/**
 * Resolvedor leve e determinístico para subconjunto de JSONPath.
 * Suporta expressões no formato:
 * - `$` (raiz)
 * - `$.prop`
 * - `$.prop1.prop2`
 * - `$.array[0]`
 * - `$.array[0].prop`
 * Sem dependências externas.
 */

export function resolveJsonPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  const trimmed = path.trim();
  if (trimmed === '$' || trimmed === '') {
    return obj;
  }

  // Remove o prefixo $. se existir
  const normalizedPath = trimmed.startsWith('$.')
    ? trimmed.slice(2)
    : trimmed.startsWith('$')
      ? trimmed.slice(1)
      : trimmed;

  // Quebra a string em segmentos de propriedade ou índice de array
  // Ex: "itens[0].valor" -> ["itens", "0", "valor"]
  const segments: string[] = [];
  const regex = /([a-zA-Z0-9_-]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null = regex.exec(normalizedPath);

  while (match !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]);
    } else if (match[2] !== undefined) {
      segments.push(match[2]);
    }
    match = regex.exec(normalizedPath);
  }

  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (Number.isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
}
