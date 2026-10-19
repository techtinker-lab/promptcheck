import { z } from 'zod';

export const ResponseFormatEnum = z.enum(['json_object', 'json_schema']);
export type ResponseFormat = z.infer<typeof ResponseFormatEnum>;

export const PricingFallbackEntrySchema = z
  .object({
    input_per_1m: z.number().nonnegative(),
    output_per_1m: z.number().nonnegative(),
  })
  .strict();

export const DefaultsConfigSchema = z
  .object({
    provider: z.string().default('openai'),
    model: z.string().default('gpt-4o-mini'),
    temperature: z.number().min(0).max(2).default(0.0),
    response_format: ResponseFormatEnum.default('json_object'),
    concurrency: z.number().int().min(1).max(50).default(5),
    fail_under: z.number().min(0).max(100).default(100),
    timeout_ms: z.number().int().min(1000).max(300000).default(30000),
    retries: z.number().int().min(0).max(10).default(3),
    max_tokens: z.number().int().positive().optional(),
    base_url: z.string().url().optional(),
  })
  .strict();

export const ContractConfigSchema = z
  .object({
    slug: z.string().min(1).max(80),
    prompt_file: z.string().min(1),
    system_file: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    response_format: ResponseFormatEnum.optional(),
    fail_under: z.number().min(0).max(100).optional(),
    timeout_ms: z.number().int().min(1000).max(300000).optional(),
    retries: z.number().int().min(0).max(10).optional(),
    max_tokens: z.number().int().positive().optional(),
    base_url: z.string().url().optional(),
    local_cases: z.string().optional(),
  })
  .strict();

export const PromptCheckConfigSchema = z
  .object({
    version: z.literal(1),
    project: z.string().min(1).max(80),
    api_url: z.string().url().default('https://api.promptcheck.techtinker.com.br'),
    defaults: DefaultsConfigSchema.default({}),
    contracts: z.array(ContractConfigSchema).min(1, 'Defina ao menos um contrato em contracts'),
    pricing_fallback: z.record(PricingFallbackEntrySchema).optional(),
  })
  .strict();

export type PromptCheckConfig = z.infer<typeof PromptCheckConfigSchema>;
export type ContractConfig = z.infer<typeof ContractConfigSchema>;
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;
