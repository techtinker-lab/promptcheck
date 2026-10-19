import { ErrorCodes } from '@promptcheck/shared';
import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/connection.js';
import { projects, users } from '../db/schema.js';
import { hashToken, verifyAccessToken } from '../services/auth.service.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  locale: string;
}

export interface AuthenticatedProject {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  defaultBranch: string;
  driftPassRateTolerance: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    project?: AuthenticatedProject;
  }
}

/**
 * Hook para autenticação de usuários do Dashboard (JWT via cookie HttpOnly ou header Bearer)
 */
export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  let token = request.cookies.access_token;

  if (!token && request.headers.authorization?.startsWith('Bearer ')) {
    token = request.headers.authorization.slice(7).trim();
  }

  if (!token) {
    return reply.status(401).send({
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Acesso não autorizado: token de autenticação ausente',
      },
    });
  }

  const verified = await verifyAccessToken(token);
  if (!verified) {
    return reply.status(401).send({
      error: {
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Sessão expirada ou token inválido',
      },
    });
  }

  const [user] = await db.select().from(users).where(eq(users.id, verified.userId)).limit(1);

  if (!user) {
    return reply.status(401).send({
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Usuário não encontrado',
      },
    });
  }

  request.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
  };
}

/**
 * Hook para autenticação da CLI via Project Token (Authorization: Bearer pck_live_...)
 * REQUISITO DE SEGURANÇA: Token trafega EXCLUSIVAMENTE no header Authorization e
 * é comparado no banco via SHA-256 (nunca em texto plano).
 */
export async function authenticateProjectToken(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: {
        code: ErrorCodes.INVALID_PROJECT_TOKEN,
        message:
          'Project Token ausente ou formato inválido. Utilize o header "Authorization: Bearer <token>"',
      },
    });
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken.startsWith('pck_live_')) {
    return reply.status(401).send({
      error: {
        code: ErrorCodes.INVALID_PROJECT_TOKEN,
        message: 'Formato inválido de Project Token. Tokens devem iniciar com "pck_live_"',
      },
    });
  }

  const tokenHash = hashToken(rawToken);

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.tokenHash, tokenHash))
    .limit(1);

  if (!project) {
    return reply.status(401).send({
      error: {
        code: ErrorCodes.INVALID_PROJECT_TOKEN,
        message: 'Project Token inválido ou revogado',
      },
    });
  }

  request.project = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    ownerId: project.ownerId,
    defaultBranch: project.defaultBranch,
    driftPassRateTolerance: Number(project.driftPassRateTolerance),
  };
}
