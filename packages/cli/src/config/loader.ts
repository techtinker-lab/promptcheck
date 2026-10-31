import { existsSync, readFileSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';
import YAML from 'yaml';
import { t } from '../i18n/index.js';
import { type PromptCheckConfig, PromptCheckConfigSchema } from './schema.js';

export interface LoadedConfig {
  config: PromptCheckConfig;
  configDir: string;
}

/**
 * Carrega variáveis de arquivos .env e .env.local no diretório do projeto
 * sem sobrescrever variáveis já definidas no ambiente do processo.
 */
export function loadLocalEnvFiles(projectDir: string): void {
  // .env.local tem precedência sobre .env, mas nenhum sobrescreve process.env existente
  const envFiles = ['.env.local', '.env'];
  for (const fileName of envFiles) {
    const filePath = resolve(projectDir, fileName);
    if (!existsSync(filePath)) continue;

    try {
      const content = readFileSync(filePath, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;

        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }

        if (key && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignora falha de leitura de .env opcional
    }
  }
}

/**
 * Busca promptcheck.yaml no diretório atual ou subindo até a raiz do repositório
 */
export function findConfigPath(explicitPath?: string): string {
  if (explicitPath) {
    return resolve(explicitPath);
  }

  let currentDir = resolve(process.cwd());
  const { root } = parse(currentDir);

  while (true) {
    const candidate = resolve(currentDir, 'promptcheck.yaml');
    if (existsSync(candidate)) {
      return candidate;
    }
    if (currentDir === root) {
      break;
    }
    currentDir = dirname(currentDir);
  }

  return resolve('promptcheck.yaml');
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
  const targetPath = findConfigPath(configPath);

  if (!existsSync(targetPath)) {
    throw new Error(t('configNotFound'));
  }

  const configDir = dirname(targetPath);
  loadLocalEnvFiles(configDir);

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
    configDir,
  };
}
