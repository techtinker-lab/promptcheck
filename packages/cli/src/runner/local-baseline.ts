import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DriftReasonCode, RunContractReport } from '@promptcheck/shared';

export interface LocalContractBaseline {
  slug: string;
  prompt_hash: string;
  contract_version: number;
  model: string;
  system_fingerprint: string | null;
  pass_rate: number;
  avg_latency_ms: number;
  updated_at: string;
}

export interface LocalBaselineFile {
  version: 1;
  project: string;
  contracts: Record<string, LocalContractBaseline>;
}

export interface LocalDriftEvaluation {
  slug: string;
  driftReasons: DriftReasonCode[];
  baseline: LocalContractBaseline | null;
}

const BASELINE_REL_PATH = '.promptcheck/baseline.json';

export function loadLocalBaseline(configDir: string, projectSlug: string): LocalBaselineFile {
  const filePath = resolve(configDir, BASELINE_REL_PATH);
  if (!existsSync(filePath)) {
    return { version: 1, project: projectSlug, contracts: {} };
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as LocalBaselineFile;
    if (parsed && typeof parsed === 'object' && parsed.contracts) {
      return parsed;
    }
  } catch {
    // Fallback para arquivo limpo se corrompido
  }

  return { version: 1, project: projectSlug, contracts: {} };
}

export function evaluateAndSaveLocalDrift(
  configDir: string,
  projectSlug: string,
  reports: RunContractReport[],
  tolerancePp = 5.0
): LocalDriftEvaluation[] {
  const baselineData = loadLocalBaseline(configDir, projectSlug);
  const evaluations: LocalDriftEvaluation[] = [];

  for (const report of reports) {
    const prev = baselineData.contracts[report.slug] || null;
    const driftReasons: DriftReasonCode[] = [];

    // Avalia drift apenas quando o prompt_hash e a versão do contrato permanecem os mesmos
    if (
      prev &&
      prev.prompt_hash === report.prompt_hash &&
      prev.contract_version === report.contract_version
    ) {
      if (
        report.system_fingerprint &&
        prev.system_fingerprint &&
        report.system_fingerprint !== prev.system_fingerprint
      ) {
        driftReasons.push('FINGERPRINT_CHANGED');
      }

      if (report.pass_rate < prev.pass_rate - tolerancePp) {
        driftReasons.push('PASS_RATE_DROPPED');
      }

      if (prev.avg_latency_ms > 0 && report.avg_latency_ms > prev.avg_latency_ms * 1.5) {
        driftReasons.push('LATENCY_INCREASED');
      }
    }

    evaluations.push({
      slug: report.slug,
      driftReasons,
      baseline: prev,
    });

    // Atualiza baseline local se o contrato passou ou se o prompt_hash mudou
    if (!prev || prev.prompt_hash !== report.prompt_hash || report.failed_cases === 0) {
      baselineData.contracts[report.slug] = {
        slug: report.slug,
        prompt_hash: report.prompt_hash,
        contract_version: report.contract_version,
        model: report.model,
        system_fingerprint: report.system_fingerprint,
        pass_rate: report.pass_rate,
        avg_latency_ms: report.avg_latency_ms,
        updated_at: new Date().toISOString(),
      };
    }
  }

  try {
    const filePath = resolve(configDir, BASELINE_REL_PATH);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(baselineData, null, 2)}\n`, 'utf-8');
  } catch {
    // Ignora falha de escrita em sistemas de arquivos somente leitura (CI)
  }

  return evaluations;
}
