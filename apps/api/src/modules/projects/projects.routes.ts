import {
  CreateProjectInputSchema,
  ErrorCodes,
  UpdateProjectInputSchema,
} from '@promptcheck/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/connection.js';
import { projects } from '../../db/schema.js';
import { authenticateUser } from '../../plugins/auth.plugin.js';
import { generateProjectToken } from '../../services/auth.service.js';
import { billingService } from '../billing/billing.service.js';

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateUser);

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects
  // ---------------------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }

    const userProjects = await db
      .select({
        id: projects.id,
        owner_id: projects.ownerId,
        name: projects.name,
        slug: projects.slug,
        default_branch: projects.defaultBranch,
        drift_pass_rate_tolerance: projects.driftPassRateTolerance,
        token_prefix: projects.tokenPrefix,
        token_rotated_at: projects.tokenRotatedAt,
        created_at: projects.createdAt,
        updated_at: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.ownerId, user.id));

    return reply.send({ projects: userProjects });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/projects
  // ---------------------------------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const parse = CreateProjectInputSchema.safeParse(request.body);

    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Parâmetros de criação do projeto inválidos',
          details: parse.error.format(),
        },
      });
    }

    const { name, slug, default_branch, drift_pass_rate_tolerance } = parse.data;

    const quota = await billingService.checkProjectQuota(user.id);
    if (!quota.allowed) {
      return reply.status(403).send({
        error: {
          code: 'PROJECT_LIMIT_EXCEEDED',
          message: `Limite de projetos atingido para seu plano (${quota.current}/${quota.max}). Faça upgrade para o plano Pro para criar mais projetos.`,
        },
      });
    }

    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.ownerId, user.id), eq(projects.slug, slug)))
      .limit(1);

    if (existing) {
      return reply.status(409).send({
        error: {
          code: ErrorCodes.PROJECT_SLUG_EXISTS,
          message: `Já existe um projeto com o slug "${slug}" nesta conta`,
        },
      });
    }

    // Gera o Project Token (apenas o hash vai para o banco)
    const { token, tokenHash, tokenPrefix } = generateProjectToken();

    const [newProject] = await db
      .insert(projects)
      .values({
        ownerId: user.id,
        name,
        slug,
        defaultBranch: default_branch,
        driftPassRateTolerance: drift_pass_rate_tolerance.toFixed(2),
        tokenHash,
        tokenPrefix,
      })
      .returning();

    if (!newProject) {
      return reply.status(500).send({
        error: { code: 'SERVER_ERROR', message: 'Falha ao salvar projeto' },
      });
    }

    return reply.status(201).send({
      project: {
        id: newProject.id,
        owner_id: newProject.ownerId,
        name: newProject.name,
        slug: newProject.slug,
        default_branch: newProject.defaultBranch,
        drift_pass_rate_tolerance: Number(newProject.driftPassRateTolerance),
        token_prefix: newProject.tokenPrefix,
        token_rotated_at: newProject.tokenRotatedAt.toISOString(),
        created_at: newProject.createdAt.toISOString(),
        updated_at: newProject.updatedAt.toISOString(),
      },
      project_token: token, // Exibido APENAS uma única vez
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects/:projectId
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>('/:projectId', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const { projectId } = request.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId
    );

    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          isUuid ? eq(projects.id, projectId) : eq(projects.slug, projectId),
          eq(projects.ownerId, user.id)
        )
      )
      .limit(1);

    if (!project) {
      return reply.status(404).send({
        error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
      });
    }

    return reply.send({
      project: {
        id: project.id,
        owner_id: project.ownerId,
        name: project.name,
        slug: project.slug,
        default_branch: project.defaultBranch,
        drift_pass_rate_tolerance: Number(project.driftPassRateTolerance),
        token_prefix: project.tokenPrefix,
        token_rotated_at: project.tokenRotatedAt.toISOString(),
        created_at: project.createdAt.toISOString(),
        updated_at: project.updatedAt.toISOString(),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/projects/:projectId
  // ---------------------------------------------------------------------------
  fastify.patch<{ Params: { projectId: string } }>('/:projectId', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const { projectId } = request.params;

    const parse = UpdateProjectInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados de atualização inválidos',
        },
      });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId
    );

    const [existing] = await db
      .select()
      .from(projects)
      .where(
        and(
          isUuid ? eq(projects.id, projectId) : eq(projects.slug, projectId),
          eq(projects.ownerId, user.id)
        )
      )
      .limit(1);

    if (!existing) {
      return reply.status(404).send({
        error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
      });
    }

    const updates: Partial<typeof projects.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (parse.data.name) updates.name = parse.data.name;
    if (parse.data.default_branch) updates.defaultBranch = parse.data.default_branch;
    if (parse.data.drift_pass_rate_tolerance !== undefined) {
      updates.driftPassRateTolerance = parse.data.drift_pass_rate_tolerance.toFixed(2);
    }

    const [updated] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, existing.id))
      .returning();

    return reply.send({ project: updated });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/projects/:projectId/token/rotate
  // ---------------------------------------------------------------------------
  fastify.post<{ Params: { projectId: string } }>(
    '/:projectId/token/rotate',
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply
          .status(401)
          .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
      }
      const { projectId } = request.params;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectId
      );

      const [existing] = await db
        .select()
        .from(projects)
        .where(
          and(
            isUuid ? eq(projects.id, projectId) : eq(projects.slug, projectId),
            eq(projects.ownerId, user.id)
          )
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
        });
      }

      // Gera novo token e invalida o anterior imediatamente
      const { token, tokenHash, tokenPrefix } = generateProjectToken();

      await db
        .update(projects)
        .set({
          tokenHash,
          tokenPrefix,
          tokenRotatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, existing.id));

      return reply.send({
        project_token: token, // Exibido APENAS uma única vez
        token_prefix: tokenPrefix,
      });
    }
  );

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/projects/:projectId
  // ---------------------------------------------------------------------------
  fastify.delete<{ Params: { projectId: string } }>('/:projectId', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const { projectId } = request.params;

    await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)));

    return reply.send({ success: true });
  });
};
