# Contribuindo com o PromptCheck 🤝

Obrigado pelo seu interesse em contribuir com o **PromptCheck**! O projeto é **100% Open Source (MIT)** e construído pela comunidade para tornar testes de contrato de prompts e detecção de drift em LLMs simples, rápidos e *Zero-Maintenance*.

---

## 🛠️ Configuração do Ambiente de Desenvolvimento

### Pré-requisitos
- **Node.js:** `>= 20.0.0`
- **pnpm:** `>= 10.0.0`
- **Docker:** opcional (necessário apenas se você quiser rodar o Control Plane + Dashboard Web local com PostgreSQL)

### Passo a Passo

```bash
# 1. Clone o repositório
git clone https://github.com/techtinker-lab/promptcheck.git
cd promptcheck

# 2. Instale as dependências do monorepo
pnpm install

# 3. Compile todos os pacotes
pnpm run build

# 4. Rode a suíte de testes e checagem de tipos
pnpm test
pnpm run typecheck
```

---

## 📦 Arquitetura do Monorepo

- `packages/cli` (`@techtinker/promptcheck`): CLI standalone com AI Auto-Discovery (`promptcheck scan`), Live Code Binding (`source_file`), validador JSON Schema (Ajv Draft 2020-12) e detecção de drift local (`.promptcheck/baseline.json`).
- `packages/shared` (`@promptcheck/shared`): Schemas Zod estritos, cálculo de hash canônico SHA-256 (`canonicalHash`), tabelas de preços de tokens e detector de segredos (`detectSecrets`).
- `apps/api` (`@promptcheck/api`): Servidor Fastify + Drizzle ORM opcional (Self-Hosted Control Plane) para histórico de runs e governança em equipe.
- `apps/web` (`@promptcheck/web`): Dashboard React + Vite + Tailwind CSS para visualização de runs, diffs estruturais e alertas de drift.

---

## ✅ Diretrizes de Código

1. **TypeScript Estrito**: `strict: true`, sem uso de `any`.
2. **Privacy by Design**: Nunca envie textos de prompts brutos ou respostas completas da LLM para fora da máquina local nos payloads de telemetria.
3. **Formatação & Lint**: Utilize `pnpm run lint:fix` (Biome) antes de abrir um Pull Request.
4. **Testes**: Adicione testes unitários (`*.test.ts`) para novas regras de validação, scanners de código ou asserções.

