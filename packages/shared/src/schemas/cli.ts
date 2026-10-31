import { z } from 'zod';
import { JsonSchemaDefinitionSchema } from './contract.js';
import { PricingTableSchema } from './pricing.js';
import { CreateTestCaseInputSchema, TestCaseSchema } from './test-case.js';

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

export const CliSyncContractItemSchema = z
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

export const CliSyncContractsPayloadSchema = z
  .object({
    contracts: z.array(CliSyncContractItemSchema).min(1).max(100),
  })
  .strict();

export const CliSyncContractsResponseSchema = z
  .object({
    project_slug: z.string().min(1).max(80),
    synced: z.number().int().nonnegative(),
    contracts: z.array(CliContractItemSchema),
  })
  .strict();

export const CliBootstrapPayloadSchema = z
  .object({
    project_slug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    project_name: z.string().min(1).max(120),
    default_branch: z.string().min(1).max(255).default('main'),
  })
  .strict();

export const CliBootstrapResponseSchema = z
  .object({
    project_slug: z.string(),
    project_name: z.string(),
    project_token: z.string(),
    dashboard_url: z.string().url(),
    created: z.boolean(),
  })
  .strict();

export type CliContractItem = z.infer<typeof CliContractItemSchema>;
export type CliContractsResponse = z.infer<typeof CliContractsResponseSchema>;
export type CliSyncContractItem = z.infer<typeof CliSyncContractItemSchema>;
export type CliSyncContractsPayload = z.infer<typeof CliSyncContractsPayloadSchema>;
export type CliSyncContractsResponse = z.infer<typeof CliSyncContractsResponseSchema>;
export type CliBootstrapPayload = z.infer<typeof CliBootstrapPayloadSchema>;
export type CliBootstrapResponse = z.infer<typeof CliBootstrapResponseSchema>;
