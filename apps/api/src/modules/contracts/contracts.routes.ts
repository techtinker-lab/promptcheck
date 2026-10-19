import { randomBytes } from 'node:crypto';
import {
  CreateContractInputSchema,
  ErrorCodes,
  type TestCase,
  UpdateContractInputSchema,
  canonicalHash,
} from '@promptcheck/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/connection.js';
import { contractVersions, contracts, projects } from '../../db/schema.js';
import { authenticateUser } from '../../plugins/auth.plugin.js';
import { validateJsonSchemaSyntax } from '../../services/schema-validator.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveProject(projectIdOrSlug: string, ownerId: string) {
  const isUuid = UUID_REGEX.test(projectIdOrSlug);
  const [project] = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(
      and(
        isUuid ? eq(projects.id, projectIdOrSlug) : eq(projects.slug, projectIdOrSlug),
        eq(projects.ownerId, ownerId)
      )
    )
    .limit(1);
  return project;
}

function serializeContract(c: typeof contracts.$inferSelect) {
  return {
    id: c.id,
    project_id: c.projectId,
    slug: c.slug,
    prompt_name: c.promptName,
    description: c.description,
    json_schema: c.jsonSchema as Record<string, unknown>,
    test_cases: (c.testCases || []) as unknown as TestCase[],
    version: c.version,
    content_hash: c.contentHash,
    is_active: c.isActive,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

export const contractRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateUser);

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects/:projectId/contracts
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>('/', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const { projectId } = request.params;

    const project = await resolveProject(projectId, user.id);

    if (!project) {
      return reply.status(404).send({
        error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
      });
    }

    const list = await db
      .select()
      .from(contracts)
      .where(eq(contracts.projectId, project.id))
      .orderBy(contracts.promptName);

    return reply.send({ contracts: list.map(serializeContract) });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/projects/:projectId/contracts
  // ---------------------------------------------------------------------------
  fastify.post<{ Params: { projectId: string } }>('/', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const { projectId } = request.params;

    const project = await resolveProject(projectId, user.id);

    if (!project) {
      return reply.status(404).send({
        error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
      });
    }

    const parse = CreateContractInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Parâmetros do contrato inválidos',
          details: parse.error.format(),
        },
      });
    }

    const { slug, prompt_name, description, json_schema, test_cases } = parse.data;

    // 1. Valida sintaxe estrita do JSON Schema com Ajv 2020-12
    const schemaValidation = validateJsonSchemaSyntax(json_schema);
    if (!schemaValidation.valid) {
      return reply.status(422).send({
        error: {
          code: ErrorCodes.INVALID_JSON_SCHEMA,
          message: `JSON Schema inválido: ${schemaValidation.error}`,
        },
      });
    }

    // 2. Garante slug único por projeto
    const [existing] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(and(eq(contracts.projectId, project.id), eq(contracts.slug, slug)))
      .limit(1);

    if (existing) {
      return reply.status(409).send({
        error: {
          code: ErrorCodes.CONTRACT_SLUG_EXISTS,
          message: `Já existe um contrato com o slug "${slug}" neste projeto`,
        },
      });
    }

    // 3. Atribui IDs estáveis para casos de teste que não possuem ID
    const normalizedCases = test_cases.map((tc) => ({
      ...tc,
      id: tc.id || `tc_${randomBytes(6).toString('hex')}`,
    }));

    // 4. Calcula content_hash canônico
    const contentHash = canonicalHash({ json_schema, test_cases: normalizedCases });

    // 5. Salva contrato e snapshot da versão 1
    const [newContract] = await db
      .insert(contracts)
      .values({
        projectId: project.id,
        slug,
        promptName: prompt_name,
        description: description || null,
        jsonSchema: json_schema,
        testCases: normalizedCases,
        version: 1,
        contentHash,
        isActive: true,
      })
      .returning();

    if (!newContract) {
      return reply.status(500).send({
        error: { code: 'SERVER_ERROR', message: 'Falha ao salvar contrato' },
      });
    }

    await db.insert(contractVersions).values({
      contractId: newContract.id,
      version: 1,
      jsonSchema: json_schema,
      testCases: normalizedCases,
      contentHash,
      createdBy: user.id,
    });

    return reply.status(201).send({ contract: serializeContract(newContract) });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects/:projectId/contracts/:contractId
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string; contractId: string } }>(
    '/:contractId',
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply
          .status(401)
          .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
      }
      const { projectId, contractId } = request.params;
      const project = await resolveProject(projectId, user.id);
      if (!project) {
        return reply.status(404).send({
          error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
        });
      }

      const [contract] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, contractId), eq(contracts.projectId, project.id)))
        .limit(1);

      if (!contract) {
        return reply.status(404).send({
          error: { code: ErrorCodes.CONTRACT_NOT_FOUND, message: 'Contrato não encontrado' },
        });
      }

      return reply.send({ contract: serializeContract(contract) });
    }
  );

  // ---------------------------------------------------------------------------
  // PUT /api/v1/projects/:projectId/contracts/:contractId (Incrementa versão se schema/casos mudarem)
  // ---------------------------------------------------------------------------
  fastify.put<{ Params: { projectId: string; contractId: string } }>(
    '/:contractId',
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply
          .status(401)
          .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
      }
      const { projectId, contractId } = request.params;

      const parse = UpdateContractInputSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados de atualização inválidos',
            details: parse.error.format(),
          },
        });
      }

      const project = await resolveProject(projectId, user.id);
      if (!project) {
        return reply.status(404).send({
          error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
        });
      }

      const [existing] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, contractId), eq(contracts.projectId, project.id)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: { code: ErrorCodes.CONTRACT_NOT_FOUND, message: 'Contrato não encontrado' },
        });
      }

      const targetSchema = parse.data.json_schema || existing.jsonSchema;
      if (parse.data.json_schema) {
        const schemaValidation = validateJsonSchemaSyntax(parse.data.json_schema);
        if (!schemaValidation.valid) {
          return reply.status(422).send({
            error: {
              code: ErrorCodes.INVALID_JSON_SCHEMA,
              message: `JSON Schema inválido: ${schemaValidation.error}`,
            },
          });
        }
      }

      const targetCases = parse.data.test_cases
        ? parse.data.test_cases.map((tc) => ({
            ...tc,
            id: tc.id || `tc_${randomBytes(6).toString('hex')}`,
          }))
        : existing.testCases;

      const newContentHash = canonicalHash({
        json_schema: targetSchema,
        test_cases: targetCases,
      });

      const hasContentChanged = newContentHash !== existing.contentHash;
      const nextVersion = hasContentChanged ? existing.version + 1 : existing.version;

      const updates: Partial<typeof contracts.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (parse.data.prompt_name) updates.promptName = parse.data.prompt_name;
      if (parse.data.description !== undefined) updates.description = parse.data.description;
      if (parse.data.is_active !== undefined) updates.isActive = parse.data.is_active;

      if (hasContentChanged) {
        updates.jsonSchema = targetSchema;
        updates.testCases = targetCases;
        updates.contentHash = newContentHash;
        updates.version = nextVersion;
      }

      const [updated] = await db
        .update(contracts)
        .set(updates)
        .where(eq(contracts.id, contractId))
        .returning();

      // Salva snapshot na tabela imutável se a versão foi incrementada
      if (hasContentChanged && updated) {
        await db.insert(contractVersions).values({
          contractId: updated.id,
          version: nextVersion,
          jsonSchema: targetSchema,
          testCases: targetCases as unknown[],
          contentHash: newContentHash,
          createdBy: user.id,
        });
      }

      if (!updated) {
        return reply.status(500).send({
          error: { code: 'SERVER_ERROR', message: 'Falha ao atualizar contrato' },
        });
      }

      return reply.send({ contract: serializeContract(updated) });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects/:projectId/contracts/:contractId/versions
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string; contractId: string } }>(
    '/:contractId/versions',
    async (request, reply) => {
      const { contractId } = request.params;

      const versions = await db
        .select()
        .from(contractVersions)
        .where(eq(contractVersions.contractId, contractId))
        .orderBy(desc(contractVersions.version));

      return reply.send({ versions });
    }
  );

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/projects/:projectId/contracts/:contractId
  // ---------------------------------------------------------------------------
  fastify.delete<{ Params: { projectId: string; contractId: string } }>(
    '/:contractId',
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply
          .status(401)
          .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
      }
      const { projectId, contractId } = request.params;
      const project = await resolveProject(projectId, user.id);
      if (!project) {
        return reply.status(404).send({
          error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
        });
      }
      await db
        .delete(contracts)
        .where(and(eq(contracts.id, contractId), eq(contracts.projectId, project.id)));
      return reply.send({ success: true });
    }
  );
};
