import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z
    .string()
    .default('postgres://postgres:postgrespassword@localhost:5432/promptcheck'),
  DATABASE_TEST_URL: z
    .string()
    .default('postgres://postgres:postgrespassword@localhost:5432/promptcheck_test'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET deve possuir no mínimo 32 caracteres para garantir alta entropia')
    .default('development-jwt-secret-min-32-chars-long-random-string'),
  COOKIE_SECRET: z
    .string()
    .min(32, 'COOKIE_SECRET deve possuir no mínimo 32 caracteres')
    .default('development-cookie-secret-min-32-chars-long-random-string'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DASHBOARD_URL: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ Falha na validação das variáveis de ambiente:', formatted);
    throw new Error('Configuração de ambiente inválida');
  }
  return result.data;
}

export const env = loadEnv();
