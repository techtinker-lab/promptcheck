import {
  DEFAULT_PRICING_TABLE,
  ErrorCodes,
  RunReportPayloadSchema,
  detectSecrets,
} from '@promptcheck/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { db } from '../../db/connection.js';
import { contracts, runContractResults, testRuns } from '../../db/schema.js';
import { authenticateProjectToken } from '../../plugins/auth.plugin.js';
import { calculateOverallRunStatus, evaluateContractDrift } from '../../services/drift.service.js';
import { billingService } from '../billing/billing.service.js';

export const cliRoutes: FastifyPluginAsync = async (fastify) => {
  // Autenticação exclusiva via Project Token (Authorization: Bearer pck_live_...)
  fastify.addHook('preHandler', authenticateProjectToken);

  // ---------------------------------------------------------------------------
  // GET /api/v1/cli/contracts
  // ---------------------------------------------------------------------------
  fastify.get<{ Querystring: { slugs?: string } }>('/contracts', async (request, reply) => {
    const project = request.project;
    if (!project) {
      return reply.status(401).send({
        error: { code: ErrorCodes.INVALID_PROJECT_TOKEN, message: 'Project Token ausente' },
      });
    }
    const { slugs } = request.query;

    const queryConditions = [eq(contracts.projectId, project.id), eq(contracts.isActive, true)];

    if (slugs) {
      const slugList = slugs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (slugList.length > 0) {
        queryConditions.push(inArray(contracts.slug, slugList));
      }
    }

    const projectContracts = await db
      .select({
        slug: contracts.slug,
        prompt_name: contracts.promptName,
        version: contracts.version,
        json_schema: contracts.jsonSchema,
        test_cases: contracts.testCases,
      })
      .from(contracts)
      .where(and(...queryConditions));

    return reply.send({
      project_slug: project.slug,
      contracts: projectContracts,
      pricing: DEFAULT_PRICING_TABLE,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/cli/runs
  // ---------------------------------------------------------------------------
  fastify.post(
    '/runs',
    {
      bodyLimit: 512 * 1024, // Limite estrito de 512 KB contra payloads DoS
    },
    async (request, reply) => {
      const project = request.project;
      if (!project) {
        return reply.status(401).send({
          error: { code: ErrorCodes.INVALID_PROJECT_TOKEN, message: 'Project Token ausente' },
        });
      }

      // 1. DETECTOR DE SEGREDOS: Proíbe envio acidental de API keys, tokens ou certificados
      const detectedSecrets = detectSecrets(request.body);
      if (detectedSecrets.length > 0) {
        return reply.status(422).send({
          error: {
            code: ErrorCodes.PAYLOAD_CONTAINS_SECRET,
            message: `O payload contém segredos ou credenciais expostas (${detectedSecrets.join(', ')}). A requisição foi bloqueada pelo SaaS.`,
          },
        });
      }

      // 2. Validação estrita do schema Zod (.strict() rejeita qualquer campo desconhecido)
      const parse = RunReportPayloadSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.INVALID_RUN_PAYLOAD,
            message: 'Payload de telemetria inválido',
            details: parse.error.format(),
          },
        });
      }

      const payload = parse.data;

      // 3. Validação de Project Mismatch (Token de outro projeto sendo usado)
      if (payload.project_slug !== project.slug) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.PROJECT_MISMATCH,
            message: `O token fornecido pertence ao projeto "${project.slug}", mas o relatório foi enviado para "${payload.project_slug}"`,
          },
        });
      }

      // 3.5. Verificação de Quota Mensal de Casos de Teste (Billing)
      const runsQuota = await billingService.checkRunsQuota(project.id);
      if (!runsQuota.allowed) {
        return reply.status(403).send({
          error: {
            code: 'MONTHLY_QUOTA_EXCEEDED',
            message: `Limite mensal de execuções de testes do plano atingido (${runsQuota.current}/${runsQuota.max}). Acesse o painel para realizar upgrade do plano.`,
          },
        });
      }

      // 4. Busca os contratos ativos do projeto
      const activeContracts = await db
        .select()
        .from(contracts)
        .where(eq(contracts.projectId, project.id));

      const contractMap = new Map(activeContracts.map((c) => [c.slug, c]));

      // 5. Avaliação de Drift e status para cada contrato
      const contractEvaluations: {
        contractId: string;
        contractVersion: number;
        slug: string;
        status: 'pass' | 'fail' | 'warning';
        provider: string;
        model: string;
        systemFingerprint: string | null;
        promptHash: string;
        totalCases: number;
        passedCases: number;
        failedCases: number;
        passRate: number;
        avgLatencyMs: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        costEstimated: boolean;
        driftReasons: string[];
        caseResults: unknown[];
      }[] = [];

      for (const contractReport of payload.contracts) {
        const contractEntity = contractMap.get(contractReport.slug);
        if (!contractEntity) {
          return reply.status(404).send({
            error: {
              code: ErrorCodes.CONTRACT_NOT_FOUND,
              message: `Contrato "${contractReport.slug}" não encontrado no projeto`,
            },
          });
        }

        // Busca run de referência (baseline) mais recente na default_branch com MESMO prompt_hash e versão
        const [baselineResult] = await db
          .select({
            systemFingerprint: runContractResults.systemFingerprint,
            passRate: runContractResults.passRate,
            avgLatencyMs: runContractResults.avgLatencyMs,
          })
          .from(runContractResults)
          .innerJoin(testRuns, eq(runContractResults.runId, testRuns.id))
          .where(
            and(
              eq(testRuns.projectId, project.id),
              eq(testRuns.branch, project.defaultBranch),
              eq(runContractResults.contractId, contractEntity.id),
              eq(runContractResults.promptHash, contractReport.prompt_hash),
              eq(runContractResults.contractVersion, contractReport.contract_version)
            )
          )
          .orderBy(desc(testRuns.executedAt))
          .limit(1);

        const evaluation = evaluateContractDrift(
          {
            slug: contractReport.slug,
            systemFingerprint: contractReport.system_fingerprint,
            passRate: contractReport.pass_rate,
            avgLatencyMs: contractReport.avg_latency_ms,
            failUnder: payload.fail_under,
          },
          baselineResult
            ? {
                systemFingerprint: baselineResult.systemFingerprint,
                passRate: Number(baselineResult.passRate),
                avgLatencyMs: baselineResult.avgLatencyMs,
              }
            : null,
          project.driftPassRateTolerance
        );

        contractEvaluations.push({
          contractId: contractEntity.id,
          contractVersion: contractReport.contract_version,
          slug: contractReport.slug,
          status: evaluation.status,
          provider: contractReport.provider,
          model: contractReport.model,
          systemFingerprint: contractReport.system_fingerprint,
          promptHash: contractReport.prompt_hash,
          totalCases: contractReport.total_cases,
          passedCases: contractReport.passed_cases,
          failedCases: contractReport.failed_cases,
          passRate: contractReport.pass_rate,
          avgLatencyMs: contractReport.avg_latency_ms,
          inputTokens: contractReport.input_tokens,
          outputTokens: contractReport.output_tokens,
          costUsd: contractReport.cost_usd,
          costEstimated: contractReport.cost_estimated,
          driftReasons: evaluation.driftReasons,
          caseResults: contractReport.case_results,
        });
      }

      // 6. Calcula o status geral da run
      const overallStatus = calculateOverallRunStatus(contractEvaluations.map((e) => e.status));

      const hasDrift = contractEvaluations.some((e) => e.driftReasons.length > 0);

      // Agrega métricas totais
      const totalCases = contractEvaluations.reduce((acc, c) => acc + c.totalCases, 0);
      const passedCases = contractEvaluations.reduce((acc, c) => acc + c.passedCases, 0);
      const failedCases = contractEvaluations.reduce((acc, c) => acc + c.failedCases, 0);
      const avgLatencyMs = Math.round(
        contractEvaluations.reduce((acc, c) => acc + c.avgLatencyMs, 0) /
          (contractEvaluations.length || 1)
      );
      const totalCostUsd = contractEvaluations.reduce((acc, c) => acc + c.costUsd, 0).toFixed(6);

      // 7. Persistência atômica da Run + Resultados por contrato
      const [insertedRun] = await db
        .insert(testRuns)
        .values({
          projectId: project.id,
          status: overallStatus,
          branch: payload.branch,
          commitSha: payload.commit_sha,
          commitAuthor: payload.commit_author,
          trigger: payload.trigger,
          ciProvider: payload.ci_provider,
          ciRunUrl: payload.ci_run_url,
          cliVersion: payload.cli_version,
          failUnder: payload.fail_under.toFixed(2),
          totalCases,
          passedCases,
          failedCases,
          avgLatencyMs,
          totalCostUsd,
          executedAt: new Date(payload.executed_at),
        })
        .returning();

      if (!insertedRun) {
        return reply.status(500).send({
          error: { code: 'SERVER_ERROR', message: 'Falha ao persistir execução' },
        });
      }

      for (const evalItem of contractEvaluations) {
        await db.insert(runContractResults).values({
          runId: insertedRun.id,
          contractId: evalItem.contractId,
          contractVersion: evalItem.contractVersion,
          status: evalItem.status,
          provider: evalItem.provider,
          model: evalItem.model,
          systemFingerprint: evalItem.systemFingerprint,
          promptHash: evalItem.promptHash,
          totalCases: evalItem.totalCases,
          passedCases: evalItem.passedCases,
          failedCases: evalItem.failedCases,
          passRate: evalItem.passRate.toFixed(2),
          avgLatencyMs: evalItem.avgLatencyMs,
          inputTokens: evalItem.inputTokens,
          outputTokens: evalItem.outputTokens,
          costUsd: evalItem.costUsd.toFixed(6),
          costEstimated: evalItem.costEstimated,
          driftReasons: evalItem.driftReasons,
          caseResults: evalItem.caseResults,
        });
      }

      const dashboardUrl = `${env.DASHBOARD_URL}/projects/${project.slug}/runs/${insertedRun.id}`;

      return reply.status(201).send({
        run_id: insertedRun.id,
        status: overallStatus,
        drift_detected: hasDrift,
        dashboard_url: dashboardUrl,
        contracts: contractEvaluations.map((e) => ({
          slug: e.slug,
          status: e.status,
          pass_rate: e.passRate,
          drift_reasons: e.driftReasons,
        })),
      });
    }
  );
};
