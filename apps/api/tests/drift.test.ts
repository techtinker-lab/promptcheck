import { describe, expect, it } from 'vitest';
import { calculateOverallRunStatus, evaluateContractDrift } from '../src/services/drift.service.js';

describe('DriftService', () => {
  it('detects FINGERPRINT_CHANGED when provider fingerprint changes', () => {
    const current = {
      slug: 'extrator-nf',
      systemFingerprint: 'fp_new_version',
      passRate: 100,
      avgLatencyMs: 400,
      failUnder: 90,
    };

    const baseline = {
      systemFingerprint: 'fp_old_version',
      passRate: 100,
      avgLatencyMs: 420,
    };

    const result = evaluateContractDrift(current, baseline);
    expect(result.driftReasons).toContain('FINGERPRINT_CHANGED');
    expect(result.status).toBe('warning');
  });

  it('tolerates pass rate drops within tolerance (e.g. 100% -> 96% with 5pp tolerance)', () => {
    const current = {
      slug: 'extrator-nf',
      systemFingerprint: 'fp_same',
      passRate: 96,
      avgLatencyMs: 400,
      failUnder: 90,
    };

    const baseline = {
      systemFingerprint: 'fp_same',
      passRate: 100,
      avgLatencyMs: 400,
    };

    const result = evaluateContractDrift(current, baseline, 5.0);
    expect(result.driftReasons).not.toContain('PASS_RATE_DROPPED');
    expect(result.status).toBe('pass');
  });

  it('detects PASS_RATE_DROPPED when drop exceeds tolerance (e.g. 100% -> 94.5% with 5pp tolerance)', () => {
    const current = {
      slug: 'extrator-nf',
      systemFingerprint: 'fp_same',
      passRate: 94.5,
      avgLatencyMs: 400,
      failUnder: 90,
    };

    const baseline = {
      systemFingerprint: 'fp_same',
      passRate: 100,
      avgLatencyMs: 400,
    };

    const result = evaluateContractDrift(current, baseline, 5.0);
    expect(result.driftReasons).toContain('PASS_RATE_DROPPED');
    expect(result.status).toBe('warning');
  });

  it('detects LATENCY_INCREASED when latency exceeds 150% of baseline', () => {
    const current = {
      slug: 'extrator-nf',
      systemFingerprint: 'fp_same',
      passRate: 100,
      avgLatencyMs: 750, // > 400 * 1.5 = 600
      failUnder: 90,
    };

    const baseline = {
      systemFingerprint: 'fp_same',
      passRate: 100,
      avgLatencyMs: 400,
    };

    const result = evaluateContractDrift(current, baseline);
    expect(result.driftReasons).toContain('LATENCY_INCREASED');
    expect(result.status).toBe('warning');
  });

  it('marks contract as fail when passRate is below failUnder, regardless of drift', () => {
    const current = {
      slug: 'extrator-nf',
      systemFingerprint: 'fp_new',
      passRate: 85, // below failUnder (90)
      avgLatencyMs: 400,
      failUnder: 90,
    };

    const baseline = {
      systemFingerprint: 'fp_old',
      passRate: 100,
      avgLatencyMs: 400,
    };

    const result = evaluateContractDrift(current, baseline);
    expect(result.status).toBe('fail');
    // Mantém as razões de drift registradas para auditoria
    expect(result.driftReasons).toContain('FINGERPRINT_CHANGED');
    expect(result.driftReasons).toContain('PASS_RATE_DROPPED');
  });

  it('calculates overall run status prioritizing fail > warning > pass', () => {
    expect(calculateOverallRunStatus(['pass', 'pass', 'pass'])).toBe('pass');
    expect(calculateOverallRunStatus(['pass', 'warning', 'pass'])).toBe('warning');
    expect(calculateOverallRunStatus(['pass', 'warning', 'fail'])).toBe('fail');
  });
});
