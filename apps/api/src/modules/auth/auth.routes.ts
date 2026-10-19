import { ErrorCodes, LoginInputSchema, RegisterInputSchema } from '@promptcheck/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/connection.js';
import { refreshTokens, users } from '../../db/schema.js';
import { authenticateUser } from '../../plugins/auth.plugin.js';
import {
  createAccessToken,
  generateRefreshToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../../services/auth.service.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/register
  // ---------------------------------------------------------------------------
  fastify.post('/register', async (request, reply) => {
    const parse = RegisterInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados de cadastro inválidos',
          details: parse.error.format(),
        },
      });
    }

    const { email, password, name, locale } = parse.data;

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return reply.status(409).send({
        error: {
          code: ErrorCodes.EMAIL_ALREADY_EXISTS,
          message: 'Este e-mail já está em uso',
        },
      });
    }

    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        locale,
      })
      .returning();

    if (!newUser) {
      return reply.status(500).send({
        error: { code: 'SERVER_ERROR', message: 'Falha ao criar usuário' },
      });
    }

    const accessToken = await createAccessToken(newUser.id);
    const { token: refreshTokenRaw, tokenHash: refreshHash } = generateRefreshToken();

    // Cria a nova família de refresh tokens (30 dias)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const familyId = crypto.randomUUID();

    await db.insert(refreshTokens).values({
      userId: newUser.id,
      tokenHash: refreshHash,
      familyId,
      expiresAt,
    });

    reply.setCookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60, // 15 minutos
    });

    reply.setCookie('refresh_token', refreshTokenRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60, // 30 dias
    });

    return reply.status(201).send({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        locale: newUser.locale,
        created_at: newUser.createdAt.toISOString(),
      },
      access_token: accessToken,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/login
  // ---------------------------------------------------------------------------
  fastify.post('/login', async (request, reply) => {
    const parse = LoginInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'E-mail ou senha inválidos',
        },
      });
    }

    const { email, password } = parse.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      return reply.status(401).send({
        error: {
          code: ErrorCodes.INVALID_CREDENTIALS,
          message: 'Credenciais inválidas',
        },
      });
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      return reply.status(401).send({
        error: {
          code: ErrorCodes.INVALID_CREDENTIALS,
          message: 'Credenciais inválidas',
        },
      });
    }

    const accessToken = await createAccessToken(user.id);
    const { token: refreshTokenRaw, tokenHash: refreshHash } = generateRefreshToken();

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const familyId = crypto.randomUUID();

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refreshHash,
      familyId,
      expiresAt,
    });

    reply.setCookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60,
    });

    reply.setCookie('refresh_token', refreshTokenRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        created_at: user.createdAt.toISOString(),
      },
      access_token: accessToken,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/refresh (Rotação de Refresh Token com Detecção de Reuso)
  // ---------------------------------------------------------------------------
  fastify.post('/refresh', async (request, reply) => {
    const rawRefreshToken = request.cookies.refresh_token;

    if (!rawRefreshToken) {
      return reply.status(401).send({
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Refresh token ausente',
        },
      });
    }

    const currentHash = hashToken(rawRefreshToken);

    const [existingToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, currentHash))
      .limit(1);

    if (!existingToken) {
      return reply.status(401).send({
        error: {
          code: ErrorCodes.INVALID_REFRESH_TOKEN,
          message: 'Refresh token inválido',
        },
      });
    }

    // DETECÇÃO DE REUSO DE REFRESH TOKEN (Se já foi revogado, toda a família é revogada!)
    if (existingToken.revokedAt || existingToken.expiresAt < new Date()) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.familyId, existingToken.familyId));

      reply.clearCookie('access_token', { path: '/' });
      reply.clearCookie('refresh_token', { path: '/api/v1/auth' });

      return reply.status(401).send({
        error: {
          code: ErrorCodes.TOKEN_REVOKED,
          message: 'Tentativa de reuso detectada. Sessão revogada por segurança.',
        },
      });
    }

    // Revoga o token atual
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, existingToken.id));

    // Emite novo par na mesma família
    const [user] = await db.select().from(users).where(eq(users.id, existingToken.userId)).limit(1);

    if (!user) {
      return reply.status(401).send({
        error: { code: ErrorCodes.UNAUTHORIZED, message: 'Usuário não encontrado' },
      });
    }

    const newAccessToken = await createAccessToken(user.id);
    const { token: newRefreshRaw, tokenHash: newRefreshHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newRefreshHash,
      familyId: existingToken.familyId,
      expiresAt,
    });

    reply.setCookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60,
    });

    reply.setCookie('refresh_token', newRefreshRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      access_token: newAccessToken,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/logout
  // ---------------------------------------------------------------------------
  fastify.post('/logout', async (request, reply) => {
    const rawRefreshToken = request.cookies.refresh_token;

    if (rawRefreshToken) {
      const currentHash = hashToken(rawRefreshToken);
      const [existing] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, currentHash))
        .limit(1);

      if (existing) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.familyId, existing.familyId));
      }
    }

    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/api/v1/auth' });

    return reply.send({ success: true });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/auth/me
  // ---------------------------------------------------------------------------
  fastify.get('/me', { preHandler: [authenticateUser] }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({
        error: { code: ErrorCodes.UNAUTHORIZED, message: 'Usuário não autenticado' },
      });
    }
    return reply.send({ user });
  });
};
