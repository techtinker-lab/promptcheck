import { z } from 'zod';
import { CreateTestCaseInputSchema, TestCaseSchema } from './test-case.js';

export const JsonSchemaDefinitionSchema = z.record(z.unknown());

export const ContractSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'O slug deve estar em formato kebab-case'),
    prompt_name: z.string().min(1).max(120),
    description: z.string().max(1000).nullable().optional(),
    json_schema: JsonSchemaDefinitionSchema,
    test_cases: z.array(TestCaseSchema).default([]),
    version: z.number().int().positive().default(1),
    content_hash: z.string().length(64),
    is_active: z.boolean().default(true),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const CreateContractInputSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'O slug deve estar em formato kebab-case'),
    prompt_name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    json_schema: JsonSchemaDefinitionSchema,
    test_cases: z.array(CreateTestCaseInputSchema).default([]),
  })
  .strict();

export const UpdateContractInputSchema = z
  .object({
    prompt_name: z.string().min(1).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
    json_schema: JsonSchemaDefinitionSchema.optional(),
    test_cases: z.array(CreateTestCaseInputSchema).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export const ContractVersionSchema = z
  .object({
    id: z.string().uuid(),
    contract_id: z.string().uuid(),
    version: z.number().int().positive(),
    json_schema: JsonSchemaDefinitionSchema,
    test_cases: z.array(TestCaseSchema),
    content_hash: z.string().length(64),
    created_by: z.string().uuid(),
    created_at: z.string().datetime(),
  })
  .strict();

export type Contract = z.infer<typeof ContractSchema>;
export type CreateContractInput = z.infer<typeof CreateContractInputSchema>;
export type UpdateContractInput = z.infer<typeof UpdateContractInputSchema>;
export type ContractVersion = z.infer<typeof ContractVersionSchema>;
