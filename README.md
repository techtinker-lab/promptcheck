# PromptCheck 🛡️ (Open Source)

> **Testes de Contrato para Prompts de IA, Live Code Binding (`source_file`) & Detecção de Drift de Modelos — 100% Open Source (MIT).**

O **PromptCheck** é uma ferramenta Open Source para engenharia de IA que garante que os prompts da sua aplicação nunca quebrem contratos JSON nem sofram degradação silenciosa quando provedores como a OpenAI atualizam seus modelos.

Diferente de ferramentas tradicionais onde você precisa copiar e colar prompts em arquivos separados, o PromptCheck possui **AI Auto-Discovery (`promptcheck scan`)** e **Live Code Binding (`source_file`)**: ele lê os prompts diretamente dos arquivos `.ts`, `.tsx`, `.js` ou `.py` da sua aplicação em tempo real!

---

## ✨ Por que usar o PromptCheck?

1. **🔍 Auto-Descoberta com IA (`promptcheck scan`)**: Escaneia seu projeto automaticamente, detecta onde você faz chamadas de LLM (`openai`, `@google/genai`, `anthropic`, Vercel AI SDK, etc.) e gera os contratos JSON Schema + casos de teste sintéticos para você.
2. **🔗 Zero Manutenção Dupla (`source_file`)**: Em vez de duplicar seus prompts em arquivos `.txt`, o contrato aponta para `source_file: ./src/lib/ai/aiService.ts`. Mudou o prompt no código? O teste já valida o prompt novo automaticamente na próxima execução.
3. **🏠 100% Standalone (Local-First) + Dashboard Self-Hosted Opcional**:
   - **Modo Standalone (CLI pura)**: Roda 100% localmente e no GitHub Actions sem precisar de banco de dados ou servidor, salvando baseline de drift em `.promptcheck/baseline.json`.
   - **Modo Control Plane (Docker Self-Hosted)**: Inclui API Fastify + PostgreSQL + Dashboard Web React completo (100% gratuito e sem limites/paywalls) para visualizar histórico de runs, comparar branches e monitorar custos/latência.
4. **🔒 Privacy by Design (LGPD)**: Nenhum texto de prompt bruto nem resposta da LLM sai da sua máquina. Apenas hashes canônicos (`SHA-256`) e metadados estruturais de validação são registrados.

---

## ⚡ Quickstart em Qualquer Projeto (30 segundos)

Dentro do repositório da sua aplicação (Node.js, Next.js, etc.):

```bash
# 1. Escaneia o código-fonte da sua aplicação e gera os contratos automaticamente:
npx promptcheck scan

# 2. Roda os testes de contrato lendo os prompts direto do seu código:
npx promptcheck test
```

> 💡 **Dica:** O `promptcheck` carrega automaticamente variáveis de ambiente do seu `.env.local` ou `.env` (como `OPENAI_API_KEY`).

---

## 📐 Como Funciona o `source_file` (Live Code Binding)

Quando você roda `promptcheck scan` (ou `promptcheck init`), ele gera um `promptcheck.yaml` vinculado diretamente aos seus arquivos de código:

```yaml
version: 1
project: meu-projeto
defaults:
  provider: openai
  model: gpt-4o-mini
  temperature: 0
  response_format: json_object
  fail_under: 95

contracts:
  - slug: compare-roadmaps
    name: Compare Roadmaps API
    source_file: ./src/app/api/ai/compare-roadmaps/route.ts
    schema:
      $schema: https://json-schema.org/draft/2020-12/schema
      type: object
      properties:
        executiveSummary:
          type: string
        overallAlignmentScore:
          type: number
      required:
        - executiveSummary
        - overallAlignmentScore
      additionalProperties: false
    cases:
      - id: tc_compare_1
        name: Comparação estruturada entre dois roadmaps
        input:
          instruction: "Retorne apenas JSON válido seguindo o schema."
        assertions:
          - type: not_empty
            path: $.executiveSummary
```

---

## 🧭 Detecção Automática de Drift

Mesmo quando ninguém altera o código (`prompt_hash` idêntico), o modelo de IA pode mudar de comportamento. O PromptCheck compara cada execução com o baseline anterior (`.promptcheck/baseline.json` localmente ou no banco PostgreSQL do Dashboard) e emite alerta quando:

1. **`FINGERPRINT_CHANGED`**: O provedor atualizou silenciosamente o `system_fingerprint` do modelo.
2. **`PASS_RATE_DROPPED`**: Queda na taxa de aprovação além da tolerância configurada (padrão: 5%).
3. **`LATENCY_INCREASED`**: Aumento de latência média superior a 50%.

---

## 🖥️ Subindo o Dashboard Web Self-Hosted (Opcional)

Se você quiser o painel visual completo para acompanhar múltiplos projetos e histórico de execuções em equipe:

```bash
# 1. Clone o repositório
git clone https://github.com/techtinker-lab/promptcheck.git
cd promptcheck

# 2. Instale as dependências
pnpm install

# 3. Suba o PostgreSQL via Docker
docker compose up -d

# 4. Crie as tabelas no banco e inicie a API + Dashboard Web
pnpm --filter @promptcheck/api run db:push
pnpm run dev
```

- **Dashboard Web:** `http://localhost:5173`
- **API Control Plane:** `http://localhost:3333`

Quando o Control Plane está rodando localmente, o comando `promptcheck init` ou `promptcheck scan` cria o projeto e configura o `PROMPTCHECK_TOKEN` automaticamente no seu `.env.local`!

---

## 🏗️ Estrutura do Monorepo

```
promptcheck/
├── apps/
│   ├── api/            # Fastify + Drizzle ORM + PostgreSQL (Self-Hosted Control Plane)
│   └── web/            # Vite + React + Tailwind CSS (Dashboard Web Dark-Mode)
├── packages/
│   ├── shared/         # Zod schemas, hashes SHA-256 canônicos e detector de segredos
│   └── cli/            # promptcheck — CLI standalone + Scanner de Código IA
├── CONTRIBUTING.md     # Guia de contribuição para a comunidade
├── LICENSE             # Licença MIT
└── docker-compose.yml  # PostgreSQL 16 para self-hosting rápido
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja [LICENSE](LICENSE) e [CONTRIBUTING.md](CONTRIBUTING.md) para mais informações.
