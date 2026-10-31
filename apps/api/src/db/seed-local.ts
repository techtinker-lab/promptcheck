import { createHash } from 'node:crypto';
import { canonicalHash } from '@promptcheck/shared';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from '../services/auth.service.js';
import { db, sql } from './connection.js';
import { contractVersions, contracts, projects, users } from './schema.js';

const LOCAL_DEV_EMAIL = 'admin@techtinker.com.br';
const LOCAL_DEV_PASSWORD = 'Admin123!@#';
const LOCAL_DEV_NAME = 'TechTinker Admin';

// Token padrão do .env.example / torneiosftv/.env.local
const TORNEIOS_PROJECT_SLUG = 'torneiosftv';
const TORNEIOS_PROJECT_NAME = 'FTV Match (Torneios FTV)';
const TORNEIOS_PROJECT_TOKEN = 'pck_live_DsiZuY0AaLs3dJUbjhHDN9TRMYiNjBvc7AXI-N07HTM';

async function seedLocal() {
  console.log('🌱 Iniciando seed local do PromptCheck para o projeto torneiosftv...\n');

  // 1. Criar ou atualizar usuário local
  const passwordHash = await hashPassword(LOCAL_DEV_PASSWORD);
  let [user] = await db.select().from(users).where(eq(users.email, LOCAL_DEV_EMAIL)).limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: LOCAL_DEV_EMAIL,
        passwordHash,
        name: LOCAL_DEV_NAME,
        locale: 'pt-BR',
      })
      .returning();
    console.log(`✅ Usuário criado: ${LOCAL_DEV_EMAIL} (Senha: ${LOCAL_DEV_PASSWORD})`);
  } else {
    [user] = await db
      .update(users)
      .set({ passwordHash, name: LOCAL_DEV_NAME, locale: 'pt-BR', updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    console.log(`ℹ️ Usuário atualizado: ${LOCAL_DEV_EMAIL} (Senha: ${LOCAL_DEV_PASSWORD})`);
  }

  if (!user) {
    throw new Error('Falha ao criar/recuperar usuário seed.');
  }

  // 2. Criar ou atualizar projeto "torneiosftv" com o token fixo de dev
  const tokenHash = createHash('sha256').update(TORNEIOS_PROJECT_TOKEN).digest('hex');
  const tokenPrefix = `${TORNEIOS_PROJECT_TOKEN.slice(0, 17)}...`;

  let [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.ownerId, user.id), eq(projects.slug, TORNEIOS_PROJECT_SLUG)))
    .limit(1);

  if (!project) {
    [project] = await db
      .insert(projects)
      .values({
        ownerId: user.id,
        name: TORNEIOS_PROJECT_NAME,
        slug: TORNEIOS_PROJECT_SLUG,
        defaultBranch: 'main',
        driftPassRateTolerance: '5.00',
        tokenHash,
        tokenPrefix,
      })
      .returning();
    console.log(`✅ Projeto criado: ${TORNEIOS_PROJECT_NAME} (slug: ${TORNEIOS_PROJECT_SLUG})`);
  } else {
    [project] = await db
      .update(projects)
      .set({
        name: TORNEIOS_PROJECT_NAME,
        tokenHash,
        tokenPrefix,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, project.id))
      .returning();
    console.log(`ℹ️ Projeto sincronizado: ${TORNEIOS_PROJECT_NAME} (slug: ${TORNEIOS_PROJECT_SLUG})`);
  }

  if (!project) {
    throw new Error('Falha ao criar/recuperar projeto torneiosftv.');
  }

  // 4. Definir contratos do FTV Match (torneiosftv)
  const contractsData = [
    {
      slug: 'copiloto-intencao-ftv',
      promptName: 'Copiloto FTV — Roteador de Intenção e Tools',
      description:
        'Valida se o Copiloto IA do FTV Match seleciona a tool determinística correta e extrai os parâmetros estruturados sem inventar dados.',
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          tool_name: {
            type: 'string',
            enum: [
              'requestOrganizerClarification',
              'proposeTournamentBlueprint',
              'recommendTournamentFormats',
              'proposeGroupDraw',
              'proposeTeamSwap',
              'proposeScheduleAdjustment',
              'proposePlayoffBracket',
            ],
          },
          commit: { type: 'boolean' },
          avoid_same_ct: { type: 'boolean' },
          not_before_time: { type: ['string', 'null'] },
          summary_pt_br: { type: 'string', minLength: 5 },
        },
        required: ['tool_name', 'commit', 'avoid_same_ct', 'not_before_time', 'summary_pt_br'],
        additionalProperties: false,
      },
      testCases: [
        {
          id: 'tc_ftv_rec_1',
          name: 'Recomendação de Formatos (4h e 2 quadras)',
          description: 'Deve acionar recommendTournamentFormats em modo prévia (commit: false)',
          input: {
            comando_organizador:
              'Recomende 3 formatos para a categoria Iniciante tendo 4 horas disponíveis e 2 quadras, separando duplas do mesmo CT.',
            categoria_ativa: 'Iniciante',
          },
          assertions: [
            { type: 'equals', path: '$.tool_name', value: 'recommendTournamentFormats' },
            { type: 'equals', path: '$.commit', value: false },
            { type: 'equals', path: '$.avoid_same_ct', value: true },
          ],
        },
        {
          id: 'tc_ftv_sched_2',
          name: 'Ajuste de Horário de Dupla Atrasada (depois das 11h)',
          description: 'Deve acionar proposeScheduleAdjustment extraindo not_before_time = 11:00',
          input: {
            comando_organizador:
              'A dupla 3 vai atrasar, jogue a primeira partida deles para depois das 11h.',
            categoria_ativa: 'Misto',
          },
          assertions: [
            { type: 'equals', path: '$.tool_name', value: 'proposeScheduleAdjustment' },
            { type: 'equals', path: '$.not_before_time', value: '11:00' },
            { type: 'equals', path: '$.commit', value: false },
          ],
        },
        {
          id: 'tc_ftv_clarif_3',
          name: 'Pedido Vago Sem Quadras/Duplas (Clarificação)',
          description: 'Não deve adivinhar cegamente quando faltam quadras e duplas',
          input: {
            comando_organizador: 'Quero criar um torneio de futevôlei neste sábado.',
            categoria_ativa: 'Nenhuma',
          },
          assertions: [
            { type: 'equals', path: '$.tool_name', value: 'requestOrganizerClarification' },
            { type: 'equals', path: '$.commit', value: false },
          ],
        },
      ],
    },
    {
      slug: 'extrator-config-torneio',
      promptName: 'FTV Match — Extrator de Estrutura de Torneio',
      description:
        'Extrai a configuração estruturada de quadras, pontuação por set e categorias a partir da descrição livre do organizador.',
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          courts_count: { type: 'integer', minimum: 1, maximum: 20 },
          points_per_set: { type: 'integer', enum: [12, 15, 18, 21] },
          scheduling_mode: { type: 'string', enum: ['parallel', 'sequential'] },
          categories: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                teams_count: { type: 'integer', minimum: 2 },
              },
              required: ['name', 'teams_count'],
              additionalProperties: false,
            },
          },
        },
        required: ['courts_count', 'points_per_set', 'scheduling_mode', 'categories'],
        additionalProperties: false,
      },
      testCases: [
        {
          id: 'tc_blueprint_1',
          name: 'Torneio 3 Quadras com Iniciante (12 duplas) e Misto (8 duplas)',
          description: 'Extrai contagem exata de quadras, sets de 18 pontos e modo paralelo',
          input: {
            descricao_torneio:
              'Monte um torneio com 3 quadras rodando em paralelo, sets de 18 pontos, categoria Iniciante com 12 duplas e categoria Misto com 8 duplas.',
          },
          assertions: [
            { type: 'equals', path: '$.courts_count', value: 3 },
            { type: 'equals', path: '$.points_per_set', value: 18 },
            { type: 'equals', path: '$.scheduling_mode', value: 'parallel' },
            { type: 'equals', path: '$.categories[0].teams_count', value: 12 },
          ],
        },
      ],
    },
  ];

  for (const c of contractsData) {
    const contentHash = canonicalHash({
      json_schema: c.jsonSchema,
      test_cases: c.testCases,
    });

    const [existingContract] = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.projectId, project.id), eq(contracts.slug, c.slug)))
      .limit(1);

    if (!existingContract) {
      const [inserted] = await db
        .insert(contracts)
        .values({
          projectId: project.id,
          slug: c.slug,
          promptName: c.promptName,
          description: c.description,
          jsonSchema: c.jsonSchema,
          testCases: c.testCases,
          version: 1,
          contentHash,
          isActive: true,
        })
        .returning();

      if (inserted) {
        await db.insert(contractVersions).values({
          contractId: inserted.id,
          version: 1,
          jsonSchema: c.jsonSchema,
          testCases: c.testCases,
          contentHash,
          createdBy: user.id,
        });
      }
      console.log(`✅ Contrato criado: ${c.slug} (${c.testCases.length} caso(s) de teste)`);
    } else {
      await db
        .update(contracts)
        .set({
          promptName: c.promptName,
          description: c.description,
          jsonSchema: c.jsonSchema,
          testCases: c.testCases,
          contentHash,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(contracts.id, existingContract.id));
      console.log(`ℹ️ Contrato atualizado: ${c.slug} (${c.testCases.length} caso(s) de teste)`);
    }
  }

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('------------------------------------------------------------');
  console.log(`🌐 Dashboard Login : ${LOCAL_DEV_EMAIL}`);
  console.log(`🔑 Dashboard Senha : ${LOCAL_DEV_PASSWORD}`);
  console.log(`📦 Project Slug    : ${TORNEIOS_PROJECT_SLUG}`);
  console.log(`🛡️ Project Token   : ${TORNEIOS_PROJECT_TOKEN}`);
  console.log('------------------------------------------------------------\n');

  await sql.end();
}

seedLocal().catch((err) => {
  console.error('❌ Erro no seed local:', err);
  process.exit(1);
});
