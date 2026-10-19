import { z } from 'zod';

export const SupportedLocaleSchema = z.enum(['en-US', 'pt-BR']);
export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;

export const RegisterInputSchema = z
  .object({
    email: z.string().email().max(320).toLowerCase().trim(),
    password: z.string().min(8, 'A senha deve conter no mínimo 8 caracteres').max(128),
    name: z.string().min(2).max(120).trim(),
    locale: SupportedLocaleSchema.default('en-US'),
  })
  .strict();

export const LoginInputSchema = z
  .object({
    email: z.string().email().max(320).toLowerCase().trim(),
    password: z.string().min(1).max(128),
  })
  .strict();

export const UserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    locale: SupportedLocaleSchema,
    created_at: z.string().datetime(),
  })
  .strict();

export const AuthResponseSchema = z
  .object({
    user: UserSchema,
    access_token: z.string(),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
