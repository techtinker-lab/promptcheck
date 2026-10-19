import { z } from 'zod';
import { JsonSchemaDefinitionSchema } from './contract.js';
import { PricingTableSchema } from './pricing.js';
import { TestCaseSchema } from './test-case.js';

export const CliContractItemSchema = z
  .object({
    slug: z.string().min(1).max(80),
    prompt_name: z.string().min(1).max(120),
    version: z.number().int().positive(),
    json_schema: JsonSchemaDefinitionSchema,
    test_cases: z.array(TestCaseSchema),
  })
  .strict();

export const CliContractsResponseSchema = z
  .object({
    project_slug: z.string().min(1).max(80),
    contracts: z.array(CliContractItemSchema),
    pricing: PricingTableSchema,
  })
  .strict();

export type CliContractItem = z.infer<typeof CliContractItemSchema>;
export type CliContractsResponse = z.infer<typeof CliContractsResponseSchema>;
