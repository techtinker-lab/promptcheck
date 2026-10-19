import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';
import { t } from '../i18n/index.js';
import { type PromptCheckConfig, PromptCheckConfigSchema } from './schema.js';

export interface LoadedConfig {
  config: PromptCheckConfig;
  configDir: string;
}

/**
 * Valida se a URL da API atende aos requisitos de segurança do AGENTS.md (HTTPS obrigatório, exceto localhost)
 */
export function validateApiUrlSecurity(apiUrl: string): void {
  const url = new URL(apiUrl);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  if (!isLocal && url.protocol !== 'https:') {
    throw new Error(t('insecureApiUrl'));
  }
}

/**
 * Carrega e valida o arquivo promptcheck.yaml
 */
export function loadConfig(configPath?: string): LoadedConfig {
  const targetPath = resolve(configPath || 'promptcheck.yaml');

  if (!existsSync(targetPath)) {
    throw new Error(t('configNotFound'));
  }

  const rawContent = readFileSync(targetPath, 'utf-8');
  let parsedYaml: unknown;

  try {
    parsedYaml = YAML.parse(rawContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${t('configInvalid')}: erro de sintaxe YAML (${msg})`);
  }

  const parseResult = PromptCheckConfigSchema.safeParse(parsedYaml);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors
      .map((e) => ` - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`${t('configInvalid')}:\n${errorDetails}`);
  }

  const config = parseResult.data;

  // Permite sobrescrever a URL da API via variável de ambiente (ex: desenvolvimento local)
  if (process.env.PROMPTCHECK_API_URL) {
    config.api_url = process.env.PROMPTCHECK_API_URL;
  }

  // Validação estrita de HTTPS
  validateApiUrlSecurity(config.api_url);

  return {
    config,
    configDir: dirname(targetPath),
  };
}
