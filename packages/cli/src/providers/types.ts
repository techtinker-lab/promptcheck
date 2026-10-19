import type { ResponseFormat } from '../config/schema.js';

export interface ProviderCallParams {
  systemPrompt?: string | undefined;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens?: number | undefined;
  responseFormat: ResponseFormat;
  jsonSchema?: Record<string, unknown> | undefined;
  contractSlug: string;
  baseUrl?: string | undefined;
  apiKey: string;
  timeoutMs: number;
  retries: number;
}

export interface ProviderResponse {
  rawContent: string;
  systemFingerprint: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderAdapter {
  call(params: ProviderCallParams): Promise<ProviderResponse>;
}
