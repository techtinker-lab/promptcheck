export type {
  User,
  Project,
  CreateProjectInput,
  ProjectCreatedResponse,
  RotateTokenResponse,
  Contract,
  ContractVersion,
  TestCase,
  Assertion,
  RunStatus,
  CaseStatus,
  CaseError,
  CaseResult,
  RunContractReport,
  RunReportPayload,
  RunReportResponse,
} from '@promptcheck/shared';

export interface TestRunEntity {
  id: string;
  projectId: string;
  status: 'pass' | 'fail' | 'warning';
  branch: string;
  commitSha: string;
  commitAuthor: string | null;
  trigger: string;
  ciProvider: string | null;
  ciRunUrl: string | null;
  cliVersion: string;
  failUnder: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  avgLatencyMs: number;
  totalCostUsd: string;
  executedAt: string;
  receivedAt: string;
}

export interface RunContractResultEntity {
  id: string;
  contract_id: string;
  contract_slug: string;
  prompt_name: string;
  contract_version: number;
  status: 'pass' | 'fail' | 'warning';
  provider: string;
  model: string;
  system_fingerprint: string | null;
  prompt_hash: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  pass_rate: string;
  avg_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  cost_estimated: boolean;
  drift_reasons: string[];
  case_results: {
    case_id: string;
    status: 'pass' | 'fail';
    latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    errors: {
      code: string;
      json_path: string;
      rule_violated: string;
      expected_type: string;
      received_type: string;
    }[];
  }[];
}

export interface RunComparisonDiff {
  pass_rate_delta: number;
  latency_delta_ms: number;
  prompt_changed: boolean;
  fingerprint_changed: boolean;
  contract_version_changed: boolean;
}

export interface RunComparisonItem {
  slug: string;
  prompt_name: string;
  base: {
    contract_slug: string;
    prompt_name: string;
    contract_version: number;
    status: 'pass' | 'fail' | 'warning';
    pass_rate: string;
    avg_latency_ms: number;
    prompt_hash: string;
    system_fingerprint: string | null;
  } | null;
  head: {
    contract_slug: string;
    prompt_name: string;
    contract_version: number;
    status: 'pass' | 'fail' | 'warning';
    pass_rate: string;
    avg_latency_ms: number;
    prompt_hash: string;
    system_fingerprint: string | null;
  };
  diff: RunComparisonDiff | null;
}
