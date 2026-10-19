import { ErrorCodes } from '@promptcheck/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/connection.js';
import { contracts, projects, runContractResults, testRuns } from '../../db/schema.js';
import { authenticateUser } from '../../plugins/auth.plugin.js';

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

export const runsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateUser);

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects/:projectId/runs
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: { projectId: string };
    Querystring: { branch?: string; status?: string; limit?: string; offset?: string };
  }>('/', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const { projectId } = request.params;
    const { branch, status, limit = '20', offset = '0' } = request.query;

    const project = await resolveProject(projectId, user.id);

    if (!project) {
      return reply.status(404).send({
        error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
      });
    }

    const conditions = [eq(testRuns.projectId, project.id)];
    if (branch) conditions.push(eq(testRuns.branch, branch));
    if (status) conditions.push(eq(testRuns.status, status));

    const runsList = await db
      .select()
      .from(testRuns)
      .where(and(...conditions))
      .orderBy(desc(testRuns.executedAt))
      .limit(Math.min(Number(limit) || 20, 100))
      .offset(Number(offset) || 0);

    return reply.send({ runs: runsList });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects/:projectId/runs/:runId
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string; runId: string } }>(
    '/:runId',
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply
          .status(401)
          .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
      }
      const { projectId, runId } = request.params;

      const project = await resolveProject(projectId, user.id);

      if (!project) {
        return reply.status(404).send({
          error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
        });
      }

      const [run] = await db
        .select()
        .from(testRuns)
        .where(and(eq(testRuns.id, runId), eq(testRuns.projectId, project.id)))
        .limit(1);

      if (!run) {
        return reply.status(404).send({
          error: { code: ErrorCodes.RUN_NOT_FOUND, message: 'Execução não encontrada' },
        });
      }

      // Busca os resultados por contrato e inclui slug do contrato
      const contractResults = await db
        .select({
          id: runContractResults.id,
          contract_id: runContractResults.contractId,
          contract_slug: contracts.slug,
          prompt_name: contracts.promptName,
          contract_version: runContractResults.contractVersion,
          status: runContractResults.status,
          provider: runContractResults.provider,
          model: runContractResults.model,
          system_fingerprint: runContractResults.systemFingerprint,
          prompt_hash: runContractResults.promptHash,
          total_cases: runContractResults.totalCases,
          passed_cases: runContractResults.passedCases,
          failed_cases: runContractResults.failedCases,
          pass_rate: runContractResults.passRate,
          avg_latency_ms: runContractResults.avgLatencyMs,
          input_tokens: runContractResults.inputTokens,
          output_tokens: runContractResults.outputTokens,
          cost_usd: runContractResults.costUsd,
          cost_estimated: runContractResults.costEstimated,
          drift_reasons: runContractResults.driftReasons,
          case_results: runContractResults.caseResults,
        })
        .from(runContractResults)
        .innerJoin(contracts, eq(runContractResults.contractId, contracts.id))
        .where(eq(runContractResults.runId, runId));

      return reply.send({
        run,
        contracts: contractResults,
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/v1/projects/:projectId/runs/compare?base=<runId>&head=<runId>
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: { projectId: string };
    Querystring: { base: string; head: string };
  }>('/compare', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply
        .status(401)
        .send({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Não autorizado' } });
    }
    const { projectId } = request.params;
    const { base, head } = request.query;

    if (!base || !head) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Parâmetros "base" e "head" são obrigatórios',
        },
      });
    }

    const project = await resolveProject(projectId, user.id);
    if (!project) {
      return reply.status(404).send({
        error: { code: ErrorCodes.PROJECT_NOT_FOUND, message: 'Projeto não encontrado' },
      });
    }

    const [baseRun] = await db
      .select()
      .from(testRuns)
      .where(and(eq(testRuns.id, base), eq(testRuns.projectId, project.id)))
      .limit(1);

    const [headRun] = await db
      .select()
      .from(testRuns)
      .where(and(eq(testRuns.id, head), eq(testRuns.projectId, project.id)))
      .limit(1);

    if (!baseRun || !headRun) {
      return reply.status(404).send({
        error: {
          code: ErrorCodes.RUN_NOT_FOUND,
          message: 'Uma ou ambas as execuções para comparação não foram encontradas',
        },
      });
    }

    const baseContracts = await db
      .select({
        contract_slug: contracts.slug,
        prompt_name: contracts.promptName,
        contract_version: runContractResults.contractVersion,
        status: runContractResults.status,
        pass_rate: runContractResults.passRate,
        avg_latency_ms: runContractResults.avgLatencyMs,
        prompt_hash: runContractResults.promptHash,
        system_fingerprint: runContractResults.systemFingerprint,
      })
      .from(runContractResults)
      .innerJoin(contracts, eq(runContractResults.contractId, contracts.id))
      .where(eq(runContractResults.runId, base));

    const headContracts = await db
      .select({
        contract_slug: contracts.slug,
        prompt_name: contracts.promptName,
        contract_version: runContractResults.contractVersion,
        status: runContractResults.status,
        pass_rate: runContractResults.passRate,
        avg_latency_ms: runContractResults.avgLatencyMs,
        prompt_hash: runContractResults.promptHash,
        system_fingerprint: runContractResults.systemFingerprint,
      })
      .from(runContractResults)
      .innerJoin(contracts, eq(runContractResults.contractId, contracts.id))
      .where(eq(runContractResults.runId, head));

    const baseMap = new Map(baseContracts.map((c) => [c.contract_slug, c]));
    const comparison = headContracts.map((headItem) => {
      const baseItem = baseMap.get(headItem.contract_slug);
      return {
        slug: headItem.contract_slug,
        prompt_name: headItem.prompt_name,
        base: baseItem || null,
        head: headItem,
        diff: baseItem
          ? {
              pass_rate_delta: Number(headItem.pass_rate) - Number(baseItem.pass_rate),
              latency_delta_ms: headItem.avg_latency_ms - baseItem.avg_latency_ms,
              prompt_changed: headItem.prompt_hash !== baseItem.prompt_hash,
              fingerprint_changed: headItem.system_fingerprint !== baseItem.system_fingerprint,
              contract_version_changed: headItem.contract_version !== baseItem.contract_version,
            }
          : null,
      };
    });

    return reply.send({
      base: baseRun,
      head: headRun,
      comparison,
    });
  });
};
