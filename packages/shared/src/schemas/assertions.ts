import { z } from 'zod';

export const AssertionEqualsSchema = z
  .object({
    type: z.literal('equals'),
    path: z.string().min(1).max(255),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })
  .strict();

export const AssertionNotNullSchema = z
  .object({
    type: z.literal('not_null'),
    path: z.string().min(1).max(255),
  })
  .strict();

export const AssertionContainsSchema = z
  .object({
    type: z.literal('contains'),
    path: z.string().min(1).max(255),
    value: z.string().min(1).max(1000),
  })
  .strict();

export const AssertionRegexSchema = z
  .object({
    type: z.literal('regex'),
    path: z.string().min(1).max(255),
    value: z.string().min(1).max(500),
  })
  .strict();

export const AssertionInEnumSchema = z
  .object({
    type: z.literal('in_enum'),
    path: z.string().min(1).max(255),
    value: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .max(100),
  })
  .strict();

export const AssertionSchema = z.discriminatedUnion('type', [
  AssertionEqualsSchema,
  AssertionNotNullSchema,
  AssertionContainsSchema,
  AssertionRegexSchema,
  AssertionInEnumSchema,
]);

export type Assertion = z.infer<typeof AssertionSchema>;
export type AssertionEquals = z.infer<typeof AssertionEqualsSchema>;
export type AssertionNotNull = z.infer<typeof AssertionNotNullSchema>;
export type AssertionContains = z.infer<typeof AssertionContainsSchema>;
export type AssertionRegex = z.infer<typeof AssertionRegexSchema>;
export type AssertionInEnum = z.infer<typeof AssertionInEnumSchema>;
