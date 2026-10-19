import type { DriftReasonCode, RunStatus } from '@promptcheck/shared';

export interface BaselineMetric {
  systemFingerprint: string | null;
  passRate: number;
  avgLatencyMs: number;
}

export interface CurrentContractMetric {
  slug: string;
  systemFingerprint: string | null;
  passRate: number;
  avgLatencyMs: number;
  failUnder: number;
}

export interface ContractDriftEvaluation {
  slug: string;
  status: RunStatus;
  driftReasons: DriftReasonCode[];
  hasBaseline: boolean;
}

/**
 * Avalia drift e calcula status para um contrato específico contra sua baseline.
 */
export function evaluateContractDrift(
  current: CurrentContractMetric,
  baseline: BaselineMetric | null,
  tolerancePp = 5.0
): ContractDriftEvaluation {
  const driftReasons: DriftReasonCode[] = [];

  // Se houver baseline na branch default com mesmo prompt_hash e versão:
  if (baseline) {
    // 1. Mudança de fingerprint do sistema
    if (
      current.systemFingerprint &&
      baseline.systemFingerprint &&
      current.systemFingerprint !== baseline.systemFingerprint
    ) {
      driftReasons.push('FINGERPRINT_CHANGED');
    }

    // 2. Queda na taxa de sucesso além da tolerância
    const passRateThreshold = baseline.passRate - tolerancePp;
    if (current.passRate < passRateThreshold) {
      driftReasons.push('PASS_RATE_DROPPED');
    }

    // 3. Aumento excessivo de latência (> 150% do baseline)
    if (baseline.avgLatencyMs > 0 && current.avgLatencyMs > baseline.avgLatencyMs * 1.5) {
      driftReasons.push('LATENCY_INCREASED');
    }
  }

  // Definição do status final do contrato
  let status: RunStatus = 'pass';

  if (current.passRate < current.failUnder) {
    status = 'fail';
  } else if (driftReasons.length > 0) {
    status = 'warning';
  }

  return {
    slug: current.slug,
    status,
    driftReasons,
    hasBaseline: baseline !== null,
  };
}

/**
 * Calcula o pior status entre todos os contratos de uma execução:
 * 'fail' > 'warning' > 'pass'
 */
export function calculateOverallRunStatus(statuses: RunStatus[]): RunStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warning')) return 'warning';
  return 'pass';
}
