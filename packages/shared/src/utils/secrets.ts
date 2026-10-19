/**
 * Detector de segredos para prevenir vazamento acidental de tokens e chaves de API.
 * Inspeciona recursivamente estruturas de dados e identifica padrões conhecidos de credenciais.
 */

const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'OPENAI_API_KEY', regex: /sk-[a-zA-Z0-9_-]{20,}/ },
  { name: 'PROMPTCHECK_TOKEN', regex: /pck_live_[a-zA-Z0-9]{20,}/ },
  { name: 'AWS_ACCESS_KEY_ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GITHUB_TOKEN', regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{36,})/ },
  { name: 'PRIVATE_KEY', regex: /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/ },
  {
    name: 'GENERIC_API_KEY',
    regex: /(?:bearer\s+[a-zA-Z0-9._-]{30,}|api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9._-]{20,}['"])/i,
  },
];

/**
 * Retorna lista de nomes dos segredos detectados em qualquer profundidade da estrutura.
 * Se nenhum segredo for encontrado, retorna array vazio.
 */
export function detectSecrets(value: unknown): string[] {
  const found = new Set<string>();

  function inspect(val: unknown) {
    if (val === null || val === undefined) return;

    if (typeof val === 'string') {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(val)) {
          found.add(pattern.name);
        }
      }
      return;
    }

    if (Array.isArray(val)) {
      for (const item of val) {
        inspect(item);
      }
      return;
    }

    if (typeof val === 'object') {
      for (const propValue of Object.values(val as Record<string, unknown>)) {
        inspect(propValue);
      }
    }
  }

  inspect(value);
  return Array.from(found);
}

/**
 * Retorna true se houver qualquer segredo no valor fornecido.
 */
export function containsSecret(value: unknown): boolean {
  return detectSecrets(value).length > 0;
}
