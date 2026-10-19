import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const JWT_SECRET_KEY = new TextEncoder().encode(env.JWT_SECRET);
const ACCESS_TOKEN_EXPIRATION = '15m';

/**
 * Hash de senha com Argon2id (parâmetros de segurança recomendados)
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Validação de senha contra hash Argon2id
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Criação de JWT de acesso com validade curta (15 minutos)
 */
export async function createAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRATION)
    .sign(JWT_SECRET_KEY);
}

/**
 * Verificação e extração do payload do JWT de acesso
 */
export async function verifyAccessToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    if (!payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Gera um Refresh Token rotativo de alta entropia
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

/**
 * Gera um Project Token para a CLI:
 * Formato: `pck_live_` + 32 bytes aleatórios em base62/base64url.
 * Retorna o token completo (exibido apenas 1x), o hash SHA-256 (para o banco) e o prefixo (para a UI).
 */
export function generateProjectToken(): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const randomPart = randomBytes(32).toString('base64url');
  const token = `pck_live_${randomPart}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const tokenPrefix = `pck_live_${randomPart.slice(0, 8)}...`;

  return { token, tokenHash, tokenPrefix };
}

/**
 * Computa o SHA-256 de um token recebido no header Authorization
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
