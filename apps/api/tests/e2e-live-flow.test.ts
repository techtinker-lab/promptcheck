import { randomBytes } from 'node:crypto';
import type { CliContractsResponse, RunReportResponse } from '@promptcheck/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('E2E Live Flow — Auth, Projects, Contracts, CLI Run, and Drift Detection', () => {
  const app = buildApp();
  const testEmail = `e2e_${Date.now()}_${randomBytes(4).toString('hex')}@techtinker.com.br`;
  const testPassword = 'Password123!@#Test';

  let authCookie: string;
  let projectId: string;
  let projectSlug: string;
  let projectToken: string;
  let contractId: string;
  let runId1: string;
  let runId2: string;

  // 1. User Registration & Auth
  it('registers a new user and returns JWT cookies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'E2E Developer',
        email: testEmail,
        password: testPassword,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(testEmail);
    expect(body.user.name).toBe('E2E Developer');

    // Capture auth cookies
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies as string];
    authCookie = cookieArray.map((c) => c.split(';')[0]).join('; ');
  });

  // 2. Project Creation with Token Generation
  it('creates a project and yields project_token exactly once', async () => {
    projectSlug = `e2e-proj-${Date.now()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        cookie: authCookie,
      },
      payload: {
        name: 'E2E Test Project',
        slug: projectSlug,
        default_branch: 'main',
        drift_pass_rate_tolerance: 5.0,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.project.slug).toBe(projectSlug);
    expect(body.project_token).toMatch(/^pck_live_[a-zA-Z0-9_-]{40,}$/);
    expect(body.project.token_prefix).toMatch(/^pck_live_[a-zA-Z0-9_-]{8}\.\.\.$/);

    projectId = body.project.id;
    projectToken = body.project_token;
  });

  // 3. Contract Creation
  it('creates a prompt contract with JSON schema and synthetic test cases', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/contracts`,
      headers: {
        cookie: authCookie,
      },
      payload: {
        slug: 'classificador-chamados',
        prompt_name: 'Classificador de Chamados',
        description: 'Classifica chamados em categorias com urgência',
        json_schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            categoria: { type: 'string', enum: ['FINANCEIRO', 'SUPORTE'] },
            urgente: { type: 'boolean' },
          },
          required: ['categoria', 'urgente'],
          additionalProperties: false,
        },
        test_cases: [
          {
            id: 'tc_e2e_1',
            name: 'Chamado Financeiro Urgente',
            input: { mensagem: 'Cobrança duplicada no cartão' },
            assertions: [
              {
                type: 'equals',
                path: '$.categoria',
                value: 'FINANCEIRO',
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.contract.slug).toBe('classificador-chamados');
    expect(body.contract.version).toBe(1);
    contractId = body.contract.id;
  });

  // 4. CLI Contracts Fetching (Execution Plane)
  it('allows CLI to download active contracts and pricing using Project Token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/cli/contracts?slugs=classificador-chamados',
      headers: {
        authorization: `Bearer ${projectToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as CliContractsResponse;
    expect(body.project_slug).toBe(projectSlug);
    expect(body.contracts).toHaveLength(1);
    expect(body.contracts[0]?.slug).toBe('classificador-chamados');
    expect(body.contracts[0]?.version).toBe(1);
    expect(body.pricing).toBeDefined();
  });

  // 5. CLI Run 1: Baseline Execution (Passing, No Drift)
  const promptHash = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

  it('records Run 1 (baseline) from CLI and returns pass status without drift', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cli/runs',
      headers: {
        authorization: `Bearer ${projectToken}`,
      },
      payload: {
        project_slug: projectSlug,
        branch: 'main',
        commit_sha: '1111111111111111111111111111111111111111',
        commit_author: 'dev-techtinker',
        trigger: 'manual',
        cli_version: '0.1.0',
        fail_under: 100,
        executed_at: new Date().toISOString(),
        contracts: [
          {
            slug: 'classificador-chamados',
            contract_version: 1,
            provider: 'openai',
            model: 'gpt-4o-mini',
            prompt_hash: promptHash,
            system_fingerprint: 'fp_v1_baseline',
            total_cases: 1,
            passed_cases: 1,
            failed_cases: 0,
            pass_rate: 100,
            avg_latency_ms: 220,
            input_tokens: 100,
            output_tokens: 30,
            cost_usd: 0.0001,
            cost_estimated: false,
            case_results: [
              {
                case_id: 'tc_e2e_1',
                status: 'pass',
                latency_ms: 220,
                input_tokens: 100,
                output_tokens: 30,
                errors: [],
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as RunReportResponse;
    expect(body.status).toBe('pass');
    expect(body.drift_detected).toBe(false);
    expect(body.run_id).toBeDefined();
    runId1 = body.run_id;
  });

  // 6. CLI Run 2: Silent Provider Upgrade (Drift Detection)
  it('detects model drift on Run 2 when system_fingerprint changes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cli/runs',
      headers: {
        authorization: `Bearer ${projectToken}`,
      },
      payload: {
        project_slug: projectSlug,
        branch: 'main',
        commit_sha: '2222222222222222222222222222222222222222',
        commit_author: 'dev-techtinker',
        trigger: 'schedule',
        cli_version: '0.1.0',
        fail_under: 100,
        executed_at: new Date().toISOString(),
        contracts: [
          {
            slug: 'classificador-chamados',
            contract_version: 1,
            provider: 'openai',
            model: 'gpt-4o-mini',
            prompt_hash: promptHash, // Same prompt hash
            system_fingerprint: 'fp_v2_silent_upgrade', // Changed fingerprint!
            total_cases: 1,
            passed_cases: 1,
            failed_cases: 0,
            pass_rate: 100,
            avg_latency_ms: 240,
            input_tokens: 100,
            output_tokens: 30,
            cost_usd: 0.0001,
            cost_estimated: false,
            case_results: [
              {
                case_id: 'tc_e2e_1',
                status: 'pass',
                latency_ms: 240,
                input_tokens: 100,
                output_tokens: 30,
                errors: [],
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as RunReportResponse;
    expect(body.status).toBe('warning');
    expect(body.drift_detected).toBe(true);
    runId2 = body.run_id;
  });

  // 7. Dashboard Comparison & Privacy by Design Verification
  it('allows dashboard to compare Run 1 and Run 2 with side-by-side diff', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/runs/compare?base=${runId1}&head=${runId2}`,
      headers: {
        cookie: authCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.base.id).toBe(runId1);
    expect(body.head.id).toBe(runId2);
    expect(body.comparison).toHaveLength(1);

    const contractDiff = body.comparison[0];
    expect(contractDiff.slug).toBe('classificador-chamados');
    expect(contractDiff.diff.fingerprint_changed).toBe(true);
    expect(contractDiff.diff.prompt_changed).toBe(false);

    // Verify Privacy by Design: raw prompt or raw LLM output never present
    const rawResponseBody = JSON.stringify(body);
    expect(rawResponseBody).not.toContain('Você é um assistente');
    expect(rawResponseBody).not.toContain('Cobrança duplicada no cartão');
  });
});
