# Arquitetura e Decisões Técnicas — PromptCheck

> **Status:** Aprovado (v1, MVP) · **Fonte da verdade técnica.**
> Este documento consolida o [requisitos.md](./requisitos.md) com as decisões de arquitetura tomadas posteriormente.
> Em caso de divergência, **este documento prevalece** sobre o `requisitos.md`. Diretrizes de código, UI e segurança estão no [AGENTS.md](../AGENTS.md).

---

## 1. Nomenclatura Oficial

| Item | Valor |
| --- | --- |
| Produto | **PromptCheck** |
| Pacote NPM | `@techtinker/promptcheck` |
| Binário da CLI | `promptcheck` (`npx @techtinker/promptcheck init` / `test`) |
| Arquivo de configuração local | `promptcheck.yaml` |
| Variável de ambiente do token | `PROMPTCHECK_TOKEN` |
| Variável de ambiente do provedor | `OPENAI_API_KEY` |
| Prefixo do Project Token | `pck_live_` |

---

## 2. Estrutura do Monorepo (pnpm workspaces)

```
promptcheck/
├── apps/
│   ├── api/        # Control Plane: Fastify + Drizzle ORM + PostgreSQL
│   └── web/        # Dashboard: Vite + React + Tailwind + TanStack Query + i18next + Lucide
├── packages/
│   ├── shared/     # Zod schemas (.strict()), tipos, códigos de erro, detector de segredos
│   └── cli/        # @techtinker/promptcheck — commander + ajv + yaml
└── docs/
```

**Regra:** todo contrato de dados trocado entre CLI ↔ API ↔ Web é definido **uma única vez** em `packages/shared` (Zod) e os tipos TypeScript são derivados via `z.infer`.

---

## 3. Modelo de Dados (PostgreSQL / Drizzle)

> Multi-tenant no MVP: apenas `users → projects` (`owner_id`). Sem `organizations`/RBAC. A FK `projects.owner_id` deve permanecer isolada para facilitar uma migração futura para `organization_id`.

### `users`
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `email` | varchar(320) unique | Normalizado em minúsculas |
| `password_hash` | text | Argon2id |
| `name` | varchar(120) | |
| `locale` | varchar(5) | `en-US` (default) \| `pt-BR` |
| `created_at` / `updated_at` | timestamptz | |

### `refresh_tokens`
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid FK → users | `on delete cascade` |
| `token_hash` | char(64) unique | SHA-256 do refresh token |
| `family_id` | uuid | Detecção de reuso: se um token já rotacionado for reapresentado, **toda a família é revogada** |
| `expires_at` | timestamptz | 30 dias |
| `revoked_at` | timestamptz null | |
| `created_at` | timestamptz | |

### `projects`
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `owner_id` | uuid FK → users | `on delete cascade` |
| `name` | varchar(120) | |
| `slug` | varchar(80) | `unique(owner_id, slug)`; kebab-case. Conferido contra o campo `project` do `promptcheck.yaml` |
| `default_branch` | varchar(255) | Default `main`. Base para a run de referência do drift |
| `drift_pass_rate_tolerance` | numeric(5,2) | Default `5.00` (pontos percentuais, 0–100). Editável no dashboard. Ver §6 |
| `token_hash` | char(64) unique | SHA-256 do token completo (lookup indexado) |
| `token_prefix` | varchar(20) | Ex.: `pck_live_a1b2` (exibição na UI) |
| `token_rotated_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

### `contracts`
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | `on delete cascade` |
| `slug` | varchar(80) | `unique(project_id, slug)`; kebab-case. Referenciado no `promptcheck.yaml` |
| `prompt_name` | varchar(120) | Nome legível |
| `description` | text null | |
| `json_schema` | jsonb | JSON Schema **Draft 2020-12**, compilado com Ajv antes de salvar |
| `test_cases` | jsonb | Ver §4 |
| `version` | integer | Começa em `1`; incrementa a cada alteração de `json_schema` ou `test_cases` |
| `content_hash` | char(64) | SHA-256 canônico de `{json_schema, test_cases}` |
| `is_active` | boolean | Default `true` |
| `created_at` / `updated_at` | timestamptz | |

### `contract_versions` (snapshot imutável)
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `contract_id` | uuid FK → contracts | |
| `version` | integer | `unique(contract_id, version)` |
| `json_schema` / `test_cases` | jsonb | Cópia exata da versão |
| `content_hash` | char(64) | |
| `created_by` | uuid FK → users | |
| `created_at` | timestamptz | |

> Necessário para que o **diff entre runs** compare exatamente o contrato vigente em cada execução.

### `test_runs` (uma execução da CLI)
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `status` | enum `pass \| fail \| warning` | Pior status entre os contratos |
| `branch` | varchar(255) | |
| `commit_sha` | char(40) | |
| `commit_author` | varchar(100) null | **Apenas nome/handle público** (nunca e-mail, por LGPD). Ver §5.4 |
| `trigger` | enum `push \| pull_request \| schedule \| manual` | |
| `ci_provider` | varchar(30) null | `github_actions`, `gitlab_ci`, `local` |
| `ci_run_url` | varchar(500) null | |
| `cli_version` | varchar(20) | |
| `fail_under` | numeric(5,2) | Limiar usado (0–100) |
| `total_cases` / `passed_cases` / `failed_cases` | integer | Agregado |
| `avg_latency_ms` | integer | |
| `total_cost_usd` | numeric(12,6) | |
| `executed_at` | timestamptz | Informado pela CLI |
| `received_at` | timestamptz | Servidor |

### `run_contract_results` (resultado por contrato dentro de uma run)
| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `run_id` | uuid FK → test_runs | `on delete cascade` |
| `contract_id` | uuid FK → contracts | |
| `contract_version` | integer | |
| `status` | enum `pass \| fail \| warning` | |
| `provider` / `model` | varchar | Ex.: `openai` / `gpt-4o-mini` |
| `system_fingerprint` | varchar(100) null | Retornado pelo provedor |
| `prompt_hash` | char(64) | SHA-256 do prompt + parâmetros (§5) |
| `total_cases` / `passed_cases` / `failed_cases` | integer | |
| `pass_rate` | numeric(5,2) | |
| `avg_latency_ms` | integer | |
| `input_tokens` / `output_tokens` | integer | |
| `cost_usd` | numeric(12,6) | |
| `cost_estimated` | boolean | `false` se o modelo não tinha preço conhecido |
| `drift_reasons` | jsonb | Array de códigos (§6) |
| `case_results` | jsonb | Ver §7 — **somente metadados** |

> **Refinamento sobre o requisitos.md:** uma execução da CLI cobre N contratos, e o drift é avaliado **por contrato** (cada um tem seu `prompt_hash` e `contract_version`). Por isso a run se divide em `test_runs` (contexto Git/CI) + `run_contract_results` (métricas por contrato).

---

## 4. Casos de Teste (Gold Dataset)

- Ficam **no SaaS** (editáveis por QAs/PMs pela UI) e, opcionalmente, em **arquivos locais** referenciados no `promptcheck.yaml`.
- São **estritamente dados sintéticos / fixtures**. A UI exibe o aviso: *"Não insira dados reais ou PII; utilize dados fictícios."*
- O que **nunca** vai para o SaaS: o **output bruto da LLM** e qualquer valor recebido na execução.

```jsonc
// Elemento de contracts.test_cases
{
  "id": "tc_8f3k2m1q",               // estável (gerado na criação; nunca reaproveitado)
  "name": "NF com múltiplos itens",
  "input": {                          // variáveis interpoladas no template do prompt ({{texto}})
    "texto": "Nota fiscal fictícia nº 123..."
  },
  "assertions": [                     // opcional — executadas pela CLI sobre o JSON parseado
    { "type": "equals",   "path": "$.categoria", "value": "FINANCEIRO" },
    { "type": "not_null", "path": "$.valor_total" },
    { "type": "contains", "path": "$.descricao", "value": "nota" },
    { "type": "regex",    "path": "$.cnpj", "value": "^\\d{14}$" },
    { "type": "in_enum",  "path": "$.status", "value": ["PAGO", "PENDENTE"] }
  ]
}
```

- `path`: subconjunto de JSONPath (`$.a.b`, `$.itens[0].valor`), resolvido nativamente pela CLI (sem dependência externa).
- Casos locais recebem IDs prefixados com `local:` e seguem as mesmas regras de privacidade no relatório.
- LLM-as-a-judge: **fora do MVP**.

---

## 5. `promptcheck.yaml` e `prompt_hash`

```yaml
version: 1
project: "meu-sistema-ia"          # slug do projeto no SaaS; conferido contra o token
# api_url: https://api.promptcheck.techtinker.com.br   # opcional; só HTTPS (http apenas para localhost)

defaults:
  provider: "openai"
  model: "gpt-4o-mini"
  temperature: 0.0
  response_format: "json_object"   # json_object | json_schema (espelhar a produção)
  concurrency: 5                   # global: máximo de requisições simultâneas
  fail_under: 100                  # % mínima de sucesso para exit code 0
  timeout_ms: 30000
  retries: 3                       # backoff exponencial em 429 / 5xx
  # max_tokens: 1024
  # base_url: https://meu-gateway-compativel/v1   # APIs compatíveis com OpenAI

contracts:
  - slug: "extrator-nota-fiscal"   # = contracts.slug cadastrado no SaaS
    prompt_file: "./src/prompts/extrator-nf.txt"
    model: "gpt-4o-mini"           # sobrescreve defaults
    # system_file: "./src/prompts/extrator-nf.system.txt"
    # response_format: "json_schema"
    # fail_under: 95
    # local_cases: "./promptcheck/cases/extrator-nf.yaml"

# pricing_fallback:                # usado se o modelo não estiver na tabela da API
#   meu-modelo-custom: { input_per_1m: 0.50, output_per_1m: 1.50 }
```

### 5.1 Regras de configuração
- **Validação:** o arquivo é validado por Zod `.strict()`. Chave desconhecida ou tipo inválido gera erro amigável e exit code 1.
- **Herança:** campo do contrato > `defaults` > padrão embutido. Padrões embutidos: `provider: openai`, `temperature: 0`, `response_format: json_object`, `concurrency: 5`, `fail_under: 100`, `timeout_ms: 30000`, `retries: 3`.
  - `concurrency` é **apenas global** (só em `defaults`).
  - A flag `--fail-under` da CLI sobrescreve todos os valores.
- **`project`:** a resposta de `GET /api/v1/cli/contracts` inclui o `slug` do projeto dono do token. Se for diferente do `project` do YAML, a CLI aborta com `PROJECT_MISMATCH`, o que protege contra o uso do token de outro projeto.
- **Tokens nunca ficam no YAML.** `PROMPTCHECK_TOKEN` e `OPENAI_API_KEY` vêm de variáveis de ambiente / secrets do CI. O `init` gera o template e garante que `.env` está no `.gitignore`.

### 5.2 Montagem da requisição
- **`prompt_file`** (obrigatório): template com placeholders `{{variavel}}`, preenchidos com o `input` do caso de teste e enviados como mensagem `user`.
- **`system_file`** (opcional): enviado como mensagem `system` (também aceita placeholders).
- Placeholder sem valor no `input` → o caso falha localmente com `TEMPLATE_VARIABLE_MISSING`. Nenhum valor é enviado ao SaaS.
- **`response_format`:**
  - `json_object`: a OpenAI exige a palavra "JSON" nas mensagens. A CLI emite um aviso se ela não estiver presente.
  - `json_schema`: a CLI envia o `json_schema` do contrato (vindo do SaaS) como `{ type: "json_schema", json_schema: { name: <slug>, schema, strict: true } }`. Se o provedor rejeitar o schema (o modo strict exige `additionalProperties: false`), os casos falham com `PROVIDER_SCHEMA_REJECTED`.
  - Em ambos os modos, a CLI **sempre** revalida a resposta com Ajv e as asserções. O resultado do provedor nunca é aceito sem verificação.

### 5.3 `prompt_hash`
- SHA-256 do JSON canônico (chaves ordenadas) de `{ system, prompt, provider, model, base_url, temperature, max_tokens, response_format }`, já com a herança aplicada. `system` e `prompt` usam o **conteúdo** dos arquivos.
- As quebras de linha são normalizadas (`CRLF` → `LF`) antes do hash, para que Windows e Linux (CI) produzam o mesmo valor.
- Parâmetros de execução (`concurrency`, `timeout_ms`, `retries`, `fail_under`) **não** entram no hash, porque não afetam a saída do modelo.
- Alterar prompt, modelo ou parâmetros muda o hash, e isso é tratado como **mudança de código** (regressão), não como drift.

### 5.4 `commit_author` (LGPD)
Coleta apenas o nome/handle público, **nunca o e-mail**. Ordem de resolução:
1. Handle do CI: `GITHUB_ACTOR` / `GITLAB_USER_LOGIN`.
2. Autor do commit: `git log -1 --format=%an`.
3. Fallback: `git config user.name`.

O formato `%ae` e a chave `user.email` nunca são lidos. Se o valor obtido parecer um e-mail (contém `@`), ele é descartado e o campo é enviado como `null`.
> No CI, o `git config user.name` geralmente está vazio ou é um bot. Por isso o autor do commit (`%an`) vem antes dele.

---

## 6. Regra de Drift (MVP)

Calculada **no servidor** ao receber `POST /api/v1/cli/runs`, por contrato:

1. **Run de referência (baseline):** o `run_contract_result` mais recente do mesmo `contract_id`, na `default_branch` do projeto, com **mesmo `prompt_hash` e mesmo `contract_version`**. Sem baseline, não há avaliação de drift.
2. **Motivos de drift** (`drift_reasons`):
   | Código | Condição |
   | --- | --- |
   | `FINGERPRINT_CHANGED` | `system_fingerprint` diferente do baseline (ambos não nulos) |
   | `PASS_RATE_DROPPED` | `pass_rate` < `pass_rate` do baseline − `projects.drift_pass_rate_tolerance` (padrão **5 p.p.**). Ex.: baseline 100%, tolerância 5 → 95% não dispara, 94,9% dispara |
   | `LATENCY_INCREASED` | `avg_latency_ms` > 1,5 × baseline |

   > A tolerância absorve a variação natural de modelos não determinísticos (`temperature > 0`). Projetos com `temperature: 0` podem reduzi-la para `0` no dashboard.
3. **Status do contrato:**
   - `fail` → `pass_rate < fail_under` (prevalece; `drift_reasons` continua registrado).
   - `warning` → `drift_reasons` não vazio.
   - `pass` → caso contrário.
4. **Status da run** = pior status entre os contratos (`fail` > `warning` > `pass`).
5. **Exit code da CLI** depende **apenas** de `fail_under` (determinístico e local). Drift é sinalizado no terminal com a resposta da API, mas não bloqueia o pipeline.

O onboarding sugere um workflow do GitHub Actions com `schedule` (cron diário/semanal) para detectar drift sem depender de PRs.

---

## 7. Payload de Telemetria (`POST /api/v1/cli/runs`)

Validado por Zod `.strict()` (chaves desconhecidas → `400`). Exemplo de `case_results`:

```jsonc
{
  "case_id": "tc_8f3k2m1q",
  "status": "fail",
  "latency_ms": 1240,
  "input_tokens": 512,
  "output_tokens": 128,
  "errors": [
    {
      "code": "SCHEMA_TYPE_MISMATCH",
      "json_path": "$.valor_total",
      "rule_violated": "type",
      "expected_type": "number",
      "received_type": "string"
    },
    {
      "code": "ASSERTION_FAILED",
      "json_path": "$.categoria",
      "rule_violated": "equals",
      "expected_type": "string",
      "received_type": "string"
    }
  ]
}
```

- **Proibido no payload:** valores recebidos da LLM, texto de prompt, inputs dos casos, chaves de API.
- O servidor também roda um **detector de segredos** (ex.: `sk-…`, `pck_live_…`, `AKIA…`, `ghp_…`, `-----BEGIN`) sobre todas as strings e rejeita com `422 PAYLOAD_CONTAINS_SECRET`.
- Strings têm tamanho máximo; arrays têm limite de itens; corpo limitado (ver §9).

---

## 8. API REST (v1)

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | — | Cadastro |
| POST | `/api/v1/auth/login` | — | Emite cookies de access + refresh |
| POST | `/api/v1/auth/refresh` | cookie refresh | Rotação do refresh token |
| POST | `/api/v1/auth/logout` | cookie | Revoga a família |
| GET | `/api/v1/auth/me` | JWT | Usuário atual |
| GET/POST | `/api/v1/projects` | JWT | Lista / cria (a criação retorna o token **uma única vez**) |
| GET/PATCH/DELETE | `/api/v1/projects/:projectId` | JWT | |
| POST | `/api/v1/projects/:projectId/token/rotate` | JWT | Revoga o token anterior e retorna o novo **uma única vez** |
| GET/POST | `/api/v1/projects/:projectId/contracts` | JWT | |
| GET/PUT/DELETE | `/api/v1/projects/:projectId/contracts/:contractId` | JWT | PUT incrementa `version` se schema/casos mudarem |
| GET | `/api/v1/projects/:projectId/contracts/:contractId/versions[/:version]` | JWT | Histórico de versões |
| GET | `/api/v1/projects/:projectId/runs` | JWT | Filtros: `branch`, `contract`, `status`, `cursor` |
| GET | `/api/v1/projects/:projectId/runs/:runId` | JWT | Detalhe com `case_results` |
| GET | `/api/v1/projects/:projectId/runs/compare?base=&head=` | JWT | Diff entre duas runs |
| GET | `/api/v1/cli/contracts?slugs=a,b` | Bearer token | Contratos ativos + **tabela de preços** (`pricing`) no mesmo payload |
| POST | `/api/v1/cli/runs` | Bearer token | Recebe o relatório; responde com status, `drift_reasons` e URL do dashboard |
| GET | `/healthz` | — | Health check |

Erros seguem o formato `{ "error": { "code": "CONTRACT_NOT_FOUND", "message": "..." } }`, com `code` em inglês (traduzido apenas na UI/CLI).

---

## 9. Segurança (parâmetros concretos)

| Tema | Decisão |
| --- | --- |
| Project Token | `pck_live_` + 32 bytes aleatórios (`crypto.randomBytes`, base62). Salvo apenas `token_hash` (SHA-256) + `token_prefix`. Exibido uma única vez |
| Senhas | Argon2id |
| Sessão | Access JWT 15 min (cookie `HttpOnly; Secure; SameSite=Strict`) + Refresh 30 dias rotativo (cookie restrito a `/api/v1/auth`) |
| CORS | Apenas `https://*.techtinker.com.br` (`localhost` só em `NODE_ENV=development`) |
| Body limit | 100 KB padrão · 512 KB em `POST /cli/runs` · 1 MB em escrita de contratos |
| Rate limit | Auth: 10 req/min por IP · CLI: 60 req/min por token · Dashboard: 300 req/min por usuário |
| Transporte | HTTPS/TLS 1.3 terminado no proxy; a CLI recusa `api_url` não-HTTPS (exceto `localhost`) |
| Logs | A CLI mascara valores de `PROMPTCHECK_TOKEN` / `OPENAI_API_KEY`; a API nunca loga o header `Authorization` nem cookies |

---

## 10. Fora do Escopo do MVP

- Organizations, times e RBAC
- LLM-as-a-judge / avaliação semântica
- Provedores não compatíveis com OpenAI (Anthropic, Google): a CLI terá uma interface `ProviderAdapter` para extensão futura
- Planos, cobrança e limites de uso
- Política automatizada de retenção/expurgo de runs
