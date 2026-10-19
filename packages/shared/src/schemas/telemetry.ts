import { z } from 'zod';

export const DriftReasonCodes = {
  FINGERPRINT_CHANGED: 'FINGERPRINT_CHANGED',
  PASS_RATE_DROPPED: 'PASS_RATE_DROPPED',
  LATENCY_INCREASED: 'LATENCY_INCREASED',
} as const;

export const DriftReasonCodeSchema = z.nativeEnum(DriftReasonCodes);
export type DriftReasonCode = z.infer<typeof DriftReasonCodeSchema>;

export const CaseStatusSchema = z.enum(['pass', 'fail']);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const RunStatusSchema = z.enum(['pass', 'fail', 'warning']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunTriggerSchema = z.enum(['push', 'pull_request', 'schedule', 'manual']);
export type RunTrigger = z.infer<typeof RunTriggerSchema>;

export const CiProviderSchema = z.enum(['github_actions', 'gitlab_ci', 'local']);
export type CiProvider = z.infer<typeof CiProviderSchema>;

/**
 * Erro estrutural ou de asserção em um caso de teste.
 * REQUISITO DE PRIVACIDADE: Não expõe valores brutos recebidos da LLM.
 */
export const CaseErrorSchema = z
  .object({
    code: z.string().min(1).max(64),
    json_path: z.string().min(1).max(255),
    rule_violated: z.string().min(1).max(64),
    expected_type: z.string().min(1).max(64),
    received_type: z.string().min(1).max(64),
  })
  .strict();

export const CaseResultSchema = z
  .object({
    case_id: z.string().min(1).max(64),
    status: CaseStatusSchema,
    latency_ms: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative().default(0),
    output_tokens: z.number().int().nonnegative().default(0),
    errors: z.array(CaseErrorSchema).max(50).default([]),
  })
  .strict();

export const RunContractReportSchema = z
  .object({
    slug: z.string().min(1).max(80),
    contract_version: z.number().int().positive(),
    provider: z.string().min(1).max(64),
    model: z.string().min(1).max(64),
    system_fingerprint: z.string().max(128).nullable().default(null),
    prompt_hash: z.string().length(64),
    total_cases: z.number().int().nonnegative(),
    passed_cases: z.number().int().nonnegative(),
    failed_cases: z.number().int().nonnegative(),
    pass_rate: z.number().min(0).max(100),
    avg_latency_ms: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative().default(0),
    output_tokens: z.number().int().nonnegative().default(0),
    cost_usd: z.number().nonnegative().default(0),
    cost_estimated: z.boolean().default(false),
    case_results: z.array(CaseResultSchema).max(500),
  })
  .strict();

/**
 * Payload consolidado enviado pela CLI (POST /api/v1/cli/runs).
 * Não deve conter textos de prompt, payloads brutos ou chaves.
 */
export const RunReportPayloadSchema = z
  .object({
    project_slug: z.string().min(1).max(80),
    branch: z.string().min(1).max(255),
    commit_sha: z.string().regex(/^[0-9a-fA-F]{7,40}$/, 'Formato inválido de commit SHA'),
    commit_author: z.string().max(100).nullable().default(null),
    trigger: RunTriggerSchema.default('manual'),
    ci_provider: CiProviderSchema.nullable().default(null),
    ci_run_url: z.string().url().max(500).nullable().default(null),
    cli_version: z.string().min(1).max(32),
    fail_under: z.number().min(0).max(100).default(100),
    executed_at: z.string().datetime(),
    contracts: z.array(RunContractReportSchema).min(1).max(100),
  })
  .strict();

export const ContractDriftReportSchema = z
  .object({
    slug: z.string(),
    status: RunStatusSchema,
    pass_rate: z.number(),
    drift_reasons: z.array(DriftReasonCodeSchema),
  })
  .strict();

export const RunReportResponseSchema = z
  .object({
    run_id: z.string().uuid(),
    status: RunStatusSchema,
    drift_detected: z.boolean(),
    dashboard_url: z.string().url(),
    contracts: z.array(ContractDriftReportSchema),
  })
  .strict();

export type CaseError = z.infer<typeof CaseErrorSchema>;
export type CaseResult = z.infer<typeof CaseResultSchema>;
export type RunContractReport = z.infer<typeof RunContractReportSchema>;
export type RunReportPayload = z.infer<typeof RunReportPayloadSchema>;
export type ContractDriftReport = z.infer<typeof ContractDriftReportSchema>;
export type RunReportResponse = z.infer<typeof RunReportResponseSchema>;
