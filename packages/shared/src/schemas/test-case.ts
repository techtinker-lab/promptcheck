import { z } from 'zod';
import { AssertionSchema } from './assertions.js';

export const TestCaseInputValuesSchema = z.record(
  z.string().min(1).max(100),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.unknown()),
    z.array(z.unknown()),
  ])
);

export const TestCaseSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    input: TestCaseInputValuesSchema,
    assertions: z.array(AssertionSchema).max(50).default([]),
  })
  .strict();

export const CreateTestCaseInputSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    input: TestCaseInputValuesSchema,
    assertions: z.array(AssertionSchema).max(50).default([]),
  })
  .strict();

export type TestCase = z.infer<typeof TestCaseSchema>;
export type CreateTestCaseInput = z.infer<typeof CreateTestCaseInputSchema>;
export type TestCaseInputValues = z.infer<typeof TestCaseInputValuesSchema>;
