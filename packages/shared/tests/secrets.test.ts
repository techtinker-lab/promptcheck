import { describe, expect, it } from 'vitest';
import { containsSecret, detectSecrets } from '../src/utils/secrets.js';

describe('detectSecrets', () => {
  it('identifies OpenAI API keys', () => {
    const payload = {
      model: 'gpt-4o',
      apiKey: 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
    };
    expect(containsSecret(payload)).toBe(true);
    expect(detectSecrets(payload)).toContain('OPENAI_API_KEY');
  });

  it('identifies PromptCheck project tokens', () => {
    const payload = {
      token: 'pck_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    };
    expect(containsSecret(payload)).toBe(true);
    expect(detectSecrets(payload)).toContain('PROMPTCHECK_TOKEN');
  });

  it('identifies AWS credentials and private keys', () => {
    const payload = [
      { aws: 'AKIAIOSFODNN7EXAMPLE' },
      { cert: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...' },
    ];
    const detected = detectSecrets(payload);
    expect(detected).toContain('AWS_ACCESS_KEY_ID');
    expect(detected).toContain('PRIVATE_KEY');
  });

  it('returns empty array when no secrets are present', () => {
    const cleanPayload = {
      project_slug: 'meu-projeto',
      branch: 'main',
      status: 'pass',
      metrics: {
        latency: 120,
        tokens: 450,
      },
    };
    expect(containsSecret(cleanPayload)).toBe(false);
    expect(detectSecrets(cleanPayload)).toHaveLength(0);
  });
});
