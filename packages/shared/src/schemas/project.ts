import { z } from 'zod';

export const ProjectSlugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'O slug deve conter apenas letras minúsculas, números e hífens'
  );

export const ProjectSchema = z
  .object({
    id: z.string().uuid(),
    owner_id: z.string().uuid(),
    name: z.string().min(1).max(120),
    slug: ProjectSlugSchema,
    default_branch: z.string().min(1).max(255).default('main'),
    drift_pass_rate_tolerance: z.number().min(0).max(100).default(5.0),
    token_prefix: z.string().min(4).max(24),
    token_rotated_at: z.string().datetime(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const CreateProjectInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: ProjectSlugSchema,
    default_branch: z.string().min(1).max(255).default('main'),
    drift_pass_rate_tolerance: z.number().min(0).max(100).default(5.0),
  })
  .strict();

export const UpdateProjectInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    default_branch: z.string().min(1).max(255).optional(),
    drift_pass_rate_tolerance: z.number().min(0).max(100).optional(),
  })
  .strict();

export const ProjectCreatedResponseSchema = z
  .object({
    project: ProjectSchema,
    project_token: z.string(), // Exibido apenas UMA ÚNICA VEZ
  })
  .strict();

export const RotateTokenResponseSchema = z
  .object({
    project_token: z.string(), // Exibido apenas UMA ÚNICA VEZ
    token_prefix: z.string(),
  })
  .strict();

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
export type ProjectCreatedResponse = z.infer<typeof ProjectCreatedResponseSchema>;
export type RotateTokenResponse = z.infer<typeof RotateTokenResponseSchema>;
