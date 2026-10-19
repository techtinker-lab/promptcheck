import { describe, expect, it } from 'vitest';
import {
  createAccessToken,
  generateProjectToken,
  generateRefreshToken,
  hashPassword,
  hashToken,
  verifyAccessToken,
  verifyPassword,
} from '../src/services/auth.service.js';

describe('Auth & Cryptography Services', () => {
  it('hashes and verifies passwords using Argon2id', async () => {
    const password = 'mySuperStrongPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toContain('$argon2id$');
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrongPassword', hash)).toBe(false);
  });

  it('signs and verifies 15-minute JWT access tokens with jose', async () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    const token = await createAccessToken(userId);

    expect(typeof token).toBe('string');
    const verified = await verifyAccessToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(userId);

    const invalid = await verifyAccessToken('invalid.jwt.token');
    expect(invalid).toBeNull();
  });

  it('generates high entropy rotating refresh tokens with SHA-256 hash', () => {
    const { token, tokenHash } = generateRefreshToken();

    expect(token.length).toBeGreaterThan(30);
    expect(tokenHash).toHaveLength(64);
    expect(hashToken(token)).toBe(tokenHash);
  });

  it('generates Project Tokens with pck_live_ prefix and SHA-256 hash', () => {
    const { token, tokenHash, tokenPrefix } = generateProjectToken();

    expect(token.startsWith('pck_live_')).toBe(true);
    expect(tokenPrefix.startsWith('pck_live_')).toBe(true);
    expect(tokenHash).toHaveLength(64);
    expect(hashToken(token)).toBe(tokenHash);
  });
});
