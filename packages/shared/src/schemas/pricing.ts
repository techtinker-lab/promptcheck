import { z } from 'zod';

export const ModelPricingSchema = z
  .object({
    input_per_1m: z.number().nonnegative(),
    output_per_1m: z.number().nonnegative(),
  })
  .strict();

export const PricingTableSchema = z
  .object({
    models: z.record(z.string().min(1).max(100), ModelPricingSchema),
    updated_at: z.string().datetime().optional(),
  })
  .strict();

export type ModelPricing = z.infer<typeof ModelPricingSchema>;
export type PricingTable = z.infer<typeof PricingTableSchema>;

/**
 * Tabela padrão de preços de referência (USD por 1 milhão de tokens)
 */
export const DEFAULT_PRICING_TABLE: PricingTable = {
  models: {
    'gpt-4o-mini': { input_per_1m: 0.15, output_per_1m: 0.6 },
    'gpt-4o': { input_per_1m: 2.5, output_per_1m: 10.0 },
    'gpt-4-turbo': { input_per_1m: 10.0, output_per_1m: 30.0 },
    'gpt-3.5-turbo': { input_per_1m: 0.5, output_per_1m: 1.5 },
    o1: { input_per_1m: 15.0, output_per_1m: 60.0 },
    'o1-mini': { input_per_1m: 3.0, output_per_1m: 12.0 },
    'o3-mini': { input_per_1m: 1.1, output_per_1m: 4.4 },
  },
  updated_at: '2026-01-01T00:00:00.000Z',
};
