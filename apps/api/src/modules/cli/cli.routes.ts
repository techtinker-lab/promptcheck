import { randomBytes } from 'node:crypto';
import {
  CliBootstrapPayloadSchema,
  CliSyncContractsPayloadSchema,
  DEFAULT_PRICING_TABLE,
  ErrorCodes,
  RunReportPayloadSchema,
  type TestCase,
  canonicalHash,
  detectSecrets,
} from '@promptcheck/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { db } from '../../db/connection.js';
import {
  contractVersions,
  contracts,
  projects,
  runContractResults,
  testRuns,
  users,
} from '../../db/schema.js';
import { authenticateProjectToken, authenticateUser } from '../../plugins/auth.plugin.js';
import { generateProjectToken, hashPassword } from '../../services/auth.service.js';
import { calculateOverallRunStatus, evaluateContractDrift } from '../../services/drift.service.js';
import { validateJsonSchemaSyntax } from '../../services/schema-validator.service.js';

const LOCAL_DEV_EMAIL = 'admin@techtinker.com.br';
const LOCAL_DEV_PASSWORD = 'Admin123!@#';
const LOCAL_DEV_NAME = 'TechTinker Admin';

export const cliRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // POST /api/v1/cli/bootstrap
  // Plug & Play: cria/recupera o projeto automaticamente para o `promptcheck init`
  // Em development, garante o usuário admin local automaticamente; em produção exige JWT.
  // ---------------------------------------------------------------------------
  fastify.post('/bootstrap', async (request, reply) => {
    const parse = CliBootstrapPayloadSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Parâmetros de bootstrap inválidos',
          details: parse.error.format(),
        },
      });
    }

    const { project_slug, project_name, default_branch } = parse.data;
    let ownerId: string;

    if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
      let [devUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, LOCAL_DEV_EMAIL))
        .limit(1);

      if (!devUser) {
        const passwordHash = await hashPassword(LOCAL_DEV_PASSWORD);
        [devUser] = await db
          .insert(users)
          .values({
            email: LOCAL_DEV_EMAIL,
            passwordHash,
            name: LOCAL_DEV_NAME,
            locale: 'pt-BR',
          })
          .returning();
      }

      if (!devUser) {
        return reply.status(500).send({
          error: { code: 'SERVER_ERROR', message: 'Falha ao provisionar usuário local' },
        });
      }

      ownerId = devUser.id;
    } else {
      await authenticateUser(request, reply);
      if (!request.user) return;
      ownerId = request.user.id;
    }

    const [existingProject] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.ownerId, ownerId), eq(projects.slug, project_slug)))
      .limit(1);

    const { token, tokenHash, tokenPrefix } = generateProjectToken();

    if (!existingProject) {
      const [created] = await db
        .insert(projects)
        .values({
          ownerId,
          name: project_name,
          slug: project_slug,
          defaultBranch: default_branch,
          driftPassRateTolerance: '5.00',
          tokenHash,
          tokenPrefix,
        })
        .returning();

      if (!created) {
        return reply.status(500).send({
          error: { code: 'SERVER_ERROR', message: 'Falha ao criar projeto no bootstrap' },
        });
      }

      return reply.status(201).send({
        project_slug: created.slug,
        project_name: created.name,
        project_token: token,
        dashboard_url: `${env.DASHBOARD_URL}/projects/${created.slug}/runs`,
        created: true,
      });
    }

    await db
      .update(projects)
      .set({
        tokenHash,
        tokenPrefix,
        tokenRotatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, existingProject.id));

    return reply.status(200).send({
      project_slug: existingProject.slug,
      project_name: existingProject.name,
      project_token: token,
      dashboard_url: `${env.DASHBOARD_URL}/projects/${existingProject.slug}/runs`,
      created: false,
    });
  });

  // ---------------------------------------------------------------------------
  // Rotas autenticadas via Project Token (Authorization: Bearer pck_live_...)
  // ---------------------------------------------------------------------------
  fastify.register(async (authedCli) => {
    authedCli.addHook('preHandler', authenticateProjectToken);

    // -------------------------------------------------------------------------
    // POST /api/v1/cli/sync (Contract-as-Code Auto-Sync)
    // Sincroniza contratos declarados no promptcheck.yaml diretamente no SaaS
    // -------------------------------------------------------------------------
    authedCli.post('/sync', async (request, reply) => {
      const project = request.project;
      if (!project) {
        return reply.status(401).send({
          error: { code: ErrorCodes.INVALID_PROJECT_TOKEN, message: 'Project Token ausente' },
        });
      }

      // 1. Detector de segredos (Privacy by Design)
      const detectedSecrets = detectSecrets(request.body);
      if (detectedSecrets.length > 0) {
        return reply.status(422).send({
          error: {
            code: ErrorCodes.PAYLOAD_CONTAINS_SECRET,
            message: `O payload contém segredos expostos (${detectedSecrets.join(', ')}).`,
          },
        });
      }

      // 2. Validação do schema Zod
      const parse = CliSyncContractsPayloadSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Payload de sincronização de contratos inválido',
            details: parse.error.format(),
          },
        });
      }

      const syncedList: {
        slug: string;
        prompt_name: string;
        version: number;
        json_schema: Record<string, unknown>;
        test_cases: TestCase[];
      }[] = [];

      for (const item of parse.data.contracts) {
        const schemaValidation = validateJsonSchemaSyntax(item.json_schema);
        if (!schemaValidation.valid) {
          return reply.status(422).send({
            error: {
              code: ErrorCodes.INVALID_JSON_SCHEMA,
              message: `JSON Schema inválido no contrato "${item.slug}": ${schemaValidation.error}`,
            },
          });
        }

        const normalizedCases: TestCase[] = item.test_cases.map((tc, idx) => ({
          id: tc.id || `tc_${item.slug.replace(/[^a-z0-9]/g, '_')}_${idx + 1}`,
          name: tc.name,
          ...(tc.description !== undefined ? { description: tc.description } : {}),
          input: tc.input,
          assertions: tc.assertions || [],
        }));

        const contentHash = canonicalHash({
          json_schema: item.json_schema,
          test_cases: normalizedCases,
        });

        const [existing] = await db
          .select()
          .from(contracts)
          .where(and(eq(contracts.projectId, project.id), eq(contracts.slug, item.slug)))
          .limit(1);

        if (!existing) {
          const [inserted] = await db
            .insert(contracts)
            .values({
              projectId: project.id,
              slug: item.slug,
              promptName: item.prompt_name,
              description: item.description || null,
              jsonSchema: item.json_schema,
              testCases: normalizedCases,
              version: 1,
              contentHash,
              isActive: true,
            })
            .returning();

          if (inserted) {
            await db.insert(contractVersions).values({
              contractId: inserted.id,
              version: 1,
              jsonSchema: item.json_schema,
              testCases: normalizedCases,
              contentHash,
              createdBy: project.ownerId || randomBytes(16).toString('hex'),
            });

            syncedList.push({
              slug: inserted.slug,
              prompt_name: inserted.promptName,
              version: inserted.version,
              json_schema: inserted.jsonSchema as Record<string, unknown>,
              test_cases: (inserted.testCases || []) as unknown as TestCase[],
            });
          }
        } else {
          const hasChanged = existing.contentHash !== contentHash;
          const nextVersion = hasChanged ? existing.version + 1 : existing.version;

          const [updated] = await db
            .update(contracts)
            .set({
              promptName: item.prompt_name,
              description: item.description ?? existing.description,
              jsonSchema: item.json_schema,
              testCases: normalizedCases,
              contentHash,
              version: nextVersion,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(contracts.id, existing.id))
            .returning();

          if (hasChanged && updated) {
            await db.insert(contractVersions).values({
              contractId: updated.id,
              version: nextVersion,
              jsonSchema: item.json_schema,
              testCases: normalizedCases,
              contentHash,
              createdBy: project.ownerId,
            });
          }

          if (updated) {
            syncedList.push({
              slug: updated.slug,
              prompt_name: updated.promptName,
              version: updated.version,
              json_schema: updated.jsonSchema as Record<string, unknown>,
              test_cases: (updated.testCases || []) as unknown as TestCase[],
            });
          }
        }
      }

      return reply.status(200).send({
        project_slug: project.slug,
        synced: syncedList.length,
        contracts: syncedList,
      });
    });

    // -------------------------------------------------------------------------
    // GET /api/v1/cli/contracts
    // -------------------------------------------------------------------------
    authedCli.get<{ Querystring: { slugs?: string } }>('/contracts', async (request, reply) => {
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

    // -------------------------------------------------------------------------
    // POST /api/v1/cli/runs
    // -------------------------------------------------------------------------
    authedCli.post(
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
  });
};
