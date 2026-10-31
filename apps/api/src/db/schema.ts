import {
  boolean,
  char,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// -----------------------------------------------------------------------------
// 1. Users (Autenticação do SaaS)
// -----------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  locale: varchar('locale', { length: 5 }).notNull().default('en-US'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// 2. Refresh Tokens (Sessão Rotativa com Detecção de Reuso)
// -----------------------------------------------------------------------------
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_idx').on(table.tokenHash),
    uniqueIndex('refresh_tokens_family_idx').on(table.familyId, table.id),
  ]
);

// -----------------------------------------------------------------------------
// 3. Projects (Multi-tenant simples: users -> projects)
// -----------------------------------------------------------------------------
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    defaultBranch: varchar('default_branch', { length: 255 }).notNull().default('main'),
    driftPassRateTolerance: numeric('drift_pass_rate_tolerance', { precision: 5, scale: 2 })
      .notNull()
      .default('5.00'),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    tokenPrefix: varchar('token_prefix', { length: 24 }).notNull(),
    tokenRotatedAt: timestamp('token_rotated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('projects_owner_slug_idx').on(table.ownerId, table.slug),
    uniqueIndex('projects_token_hash_idx').on(table.tokenHash),
  ]
);

// -----------------------------------------------------------------------------
// 4. Contracts (Contratos de Prompts & JSON Schema)
// -----------------------------------------------------------------------------
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 80 }).notNull(),
    promptName: varchar('prompt_name', { length: 120 }).notNull(),
    description: text('description'),
    jsonSchema: jsonb('json_schema').notNull(),
    testCases: jsonb('test_cases').notNull().default([]),
    version: integer('version').notNull().default(1),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('contracts_project_slug_idx').on(table.projectId, table.slug)]
);

// -----------------------------------------------------------------------------
// 5. Contract Versions (Snapshots Imutáveis para Diffs Exatos)
// -----------------------------------------------------------------------------
export const contractVersions = pgTable(
  'contract_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    jsonSchema: jsonb('json_schema').notNull(),
    testCases: jsonb('test_cases').notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('contract_versions_uidx').on(table.contractId, table.version)]
);

// -----------------------------------------------------------------------------
// 6. Test Runs (Execução enviada pela CLI)
// -----------------------------------------------------------------------------
export const testRuns = pgTable('test_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull(), // 'pass' | 'fail' | 'warning'
  branch: varchar('branch', { length: 255 }).notNull(),
  commitSha: varchar('commit_sha', { length: 40 }).notNull(),
  commitAuthor: varchar('commit_author', { length: 100 }), // Apenas username (LGPD)
  trigger: varchar('trigger', { length: 20 }).notNull().default('manual'),
  ciProvider: varchar('ci_provider', { length: 30 }),
  ciRunUrl: varchar('ci_run_url', { length: 500 }),
  cliVersion: varchar('cli_version', { length: 32 }).notNull(),
  failUnder: numeric('fail_under', { precision: 5, scale: 2 }).notNull(),
  totalCases: integer('total_cases').notNull().default(0),
  passedCases: integer('passed_cases').notNull().default(0),
  failedCases: integer('failed_cases').notNull().default(0),
  avgLatencyMs: integer('avg_latency_ms').notNull().default(0),
  totalCostUsd: numeric('total_cost_usd', { precision: 12, scale: 6 })
    .notNull()
    .default('0.000000'),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// 7. Run Contract Results (Métricas por Contrato na Run)
// -----------------------------------------------------------------------------
export const runContractResults = pgTable('run_contract_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => testRuns.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => contracts.id, { onDelete: 'cascade' }),
  contractVersion: integer('contract_version').notNull(),
  status: varchar('status', { length: 16 }).notNull(), // 'pass' | 'fail' | 'warning'
  provider: varchar('provider', { length: 64 }).notNull(),
  model: varchar('model', { length: 64 }).notNull(),
  systemFingerprint: varchar('system_fingerprint', { length: 128 }),
  promptHash: char('prompt_hash', { length: 64 }).notNull(),
  totalCases: integer('total_cases').notNull(),
  passedCases: integer('passed_cases').notNull(),
  failedCases: integer('failed_cases').notNull(),
  passRate: numeric('pass_rate', { precision: 5, scale: 2 }).notNull(),
  avgLatencyMs: integer('avg_latency_ms').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0.000000'),
  costEstimated: boolean('cost_estimated').notNull().default(false),
  driftReasons: jsonb('drift_reasons').notNull().default([]),
  caseResults: jsonb('case_results').notNull().default([]),
});

// -----------------------------------------------------------------------------
// 8. Subscriptions (Stripe / Billing por Usuário)
// -----------------------------------------------------------------------------
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).unique(),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).unique(),
    plan: varchar('plan', { length: 32 }).notNull().default('free'), // 'free' | 'pro' | 'enterprise'
    status: varchar('status', { length: 32 }).notNull().default('active'), // 'active' | 'canceled' | 'past_due' etc.
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('subscriptions_user_idx').on(table.userId),
    uniqueIndex('subscriptions_stripe_customer_idx').on(table.stripeCustomerId),
    uniqueIndex('subscriptions_stripe_sub_idx').on(table.stripeSubscriptionId),
  ]
);
