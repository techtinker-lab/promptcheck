## 1. UI/UX & Design Guidelines (PromptCheck / TechTinker)

Ao gerar componentes de interface (Frontend em React / Tailwind CSS), siga estritamente estas diretrizes visuais e de experiência:

1. **Aesthetic & Theme:**
   - Adotar um design system moderno voltado para desenvolvedores (estilo Vercel / Linear / Supabase).
   - Utilizar obrigatoriamente **Dark Mode** como padrão, utilizando paletas de cinza escuro, preto e ardósia (ex: `bg-zinc-950`, `bg-slate-900`, `border-zinc-800`).
   - Textos primários em `text-zinc-100` e secundários em `text-zinc-400`.

2. **Typography & Code Blocks:**
   - Utilizar fontes monoespadas (`font-mono`, ex: `JetBrains Mono`) para exibir JSON Schemas, trechos de código, hashes de commit, IDs de projetos e comandos de terminal.
   - Textos de interface comuns devem utilizar tipografia sans-serif limpa (`Inter` ou similar).

3. **Status & Feedback Visual:**
   - Padronizar as cores de status em toda a aplicação:
     - **Sucesso (Pass):** Tons de Esmeralda (`emerald-400` / `emerald-950`).
     - **Falha Crítica (Fail):** Tons de Rose/Vermelho (`rose-400` / `rose-950`).
     - **Aviso / Drift (Warning):** Tons de Âmbar (`amber-400` / `amber-950`).
   - Evitar telas poluídas; priorizar densidade de informação com tabelas limpas, cards bem espaçados e bordas sutis.

4. **Developer Experience (DX):**
   - Garantir que todos os elementos interativos tenham estados de `hover`, `focus` e `loading` claros.
   - Componentes de cópia rápida (ex: copiar Project Token ou comando da CLI) devem ter feedback visual instantâneo ("Copiado!").

## 2. Arquitetura e Engenharia (PromptCheck / TechTinker)

### 2.1 Stack & Tecnologias Padrão
- **Monorepo:** `pnpm workspaces`, TypeScript em todos os pacotes, Node.js ≥ 20 (usar `fetch` nativo).
- **Backend (Control Plane):** Node.js/TypeScript com **Fastify** + **Drizzle ORM** + **PostgreSQL**. Plugins oficiais do Fastify para cookie, CORS e rate-limit.
- **Frontend (Dashboard):** **Vite** + React + Tailwind CSS + Lucide Icons + TanStack React Query (para chamadas de API) + `i18next`/`react-i18next`.
- **CLI (Execution Plane):** TypeScript puro rodando via Node.js, utilizando bibliotecas leves (`commander` para comandos, `ajv` (Draft 2020-12) para validação de JSON Schema, `yaml` para o `promptcheck.yaml` e `fetch` nativo para requisições, inclusive para a OpenAI, **sem** o SDK oficial).
- **Testes:** Vitest em todos os pacotes.

### 2.2 Princípios de Código (Clean Code & Segurança)
- **Clareza antes do código:** Priorizar a legibilidade, modularidade e tratamento robusto de erros antes de focar em otimizações prematuras.
- **Tipagem Estrita:** Uso obrigatório de TypeScript estrito (`strict: true`). Evitar o uso de `any` em hipótese alguma; se o tipo for dinâmico, utilizar `unknown` com type guards ou genéricos apropriados.
- **Privacy by Design (LGPD / Segurança):** O backend do SaaS **nunca** deve persistir chaves de API de provedores terceiros em texto plano (se houver salvamento, deve ser criptografado) e **nunca** deve aceitar ou salvar dados brutos de clientes nos payloads de teste enviados pela CLI (apenas metadados de engenharia).
  - **Permitido no SaaS:** casos de teste (Gold Dataset) cadastrados pela UI, que são **exclusivamente dados sintéticos/fixtures**. A UI deve exibir o aviso "Não insira dados reais/PII; utilize dados fictícios".
  - **Proibido no SaaS:** output bruto da LLM, valores recebidos na execução, texto do prompt (vai apenas o `prompt_hash`) e chaves de API. Diffs de erro expõem somente `json_path`, `rule_violated`, `expected_type` e `received_type`.
  - **Git:** `commit_author` armazena apenas o username, nunca o e-mail.

### 2.3 Padrão de Commits e Organização
- **Mensagens de Commit:** Seguir o padrão Conventional Commits (ex: `feat: add json schema validator`, `fix(cli): handle missing env var`, `docs: update setup guide`). Usar o nome do pacote como escopo: `api`, `web`, `cli`, `shared`.
- **Tratamento de Erros na CLI:** A CLI deve falhar de forma elegante, exibindo mensagens amigáveis no terminal e encerrando com o código de saída correto (`process.exit(1)`) quando houver falhas de contrato ou de conexão, para garantir o bloqueio adequado no CI/CD.

### 2.4. O que a IA DEVE evitar (Anti-Patterns)
- Não gerar código monolítico gigante; separar lógica de rotas, regras de negócio e acesso a banco em arquivos distintos.
- Não inventar dependências despesadas ou pacotes npm pesados se bibliotecas nativas ou o ecossistema padrão já resolverem o problema.
- Não ignorar tratamento de erros assíduos em requisições de API (`try/catch` obrigatório com fallbacks claros).
- Não duplicar contratos de dados: schemas trocados entre CLI ↔ API ↔ Web vivem **somente** em `packages/shared` (Zod), com tipos derivados via `z.infer`.

### 2.5 Estrutura do Repositório
```
apps/api        # Fastify — src/modules/<dominio>/{routes,service,repository,schemas}.ts
apps/web        # Vite + React — src/{features,components,lib,locales}
packages/shared # Zod schemas, tipos, códigos de erro, detector de segredos
packages/cli    # @techtinker/promptcheck — src/{commands,config,providers,runner,validation,reporter,i18n}
docs/           # requisitos.md, guia_ui_ux.md, arquitetura.md
```
- **Fonte da verdade técnica:** [`docs/arquitetura.md`](docs/arquitetura.md) (modelo de dados, regra de drift, rotas, payloads). Ele prevalece sobre o `docs/requisitos.md` em caso de divergência.
- **Nomenclatura oficial:** produto `PromptCheck` · pacote `@techtinker/promptcheck` · binário `promptcheck` · config `promptcheck.yaml` · env `PROMPTCHECK_TOKEN`.

## 3. Internacionalização (i18n) & Localização
- **Idiomas Suportados:** Português do Brasil (`pt-BR`) e Inglês (`en-US`). O Inglês deve ser o idioma padrão (fallback) do sistema e da CLI.
- **Implementação no SaaS (Dashboard):** 
  - Utilizar uma biblioteca leve de i18n (ex: `i18next` com `react-i18next` ou estrutura baseada em arquivos JSON de tradução `locales/en.json` e `locales/pt.json`).
  - O idioma da interface deve respeitar a preferência do navegador do usuário, com um botão seletor de idioma visível no header ou nas configurações de perfil.
- **Implementação na CLI:**
  - As mensagens impressas no terminal (sucessos, erros, tabelas de resumo) devem suportar múltiplos idiomas.
  - A CLI deve detectar o idioma do sistema operacional (`process.env.LANG` ou `Intl.DateTimeFormat`) ou aceitar uma flag global (ex: `--lang=pt` ou `--lang=en`).
- **Mensagens de Erro e Relatórios:**
  - Chaves de erro e relatórios enviados ao SaaS devem usar identificadores padronizados (códigos de erro em inglês) para facilitar o log, exibindo a tradução amigável apenas na interface visual do usuário.

## 4. Segurança & Compliance (PromptCheck / TechTinker)

### 4.1 Gestão de Autenticação e Tokens (Control Plane)
- **Project Tokens (CLI):** Formato `pck_live_` + 32 bytes aleatórios (`crypto.randomBytes`, base62). No banco ficam **apenas** `token_hash` (SHA-256 do token completo, indexado e único) e `token_prefix` (ex: `pck_live_a1b2`, para exibição). O token em texto puro é exibido **uma única vez** (na criação ou na rotação) e nunca mais pode ser recuperado. Rotacionar invalida imediatamente o token anterior.
  - *Por que SHA-256 sem salt:* o token tem alta entropia (256 bits), o que torna força bruta/rainbow tables inviáveis e permite lookup direto pelo hash. Argon2/salt ficam reservados para **senhas** de usuários.
- **Autenticação de Usuários (SaaS):** O acesso ao Dashboard Web deve exigir autenticação robusta: senha com **Argon2id**, Access JWT de **15 min** em cookie `HttpOnly; Secure; SameSite=Strict` e Refresh Token **rotativo** (30 dias, cookie restrito a `/api/v1/auth`, salvo como hash). Reuso de refresh token já rotacionado revoga toda a família de tokens.

### 4.2 Validação de Entrada & Sanitização (API Security)
- **Validação de Payload:** Todos os endpoints REST da API devem validar estritamente o payload recebido com **Zod**, usando os schemas compartilhados de `packages/shared` com `.strict()` (chaves desconhecidas são rejeitadas). O endpoint que recebe os relatórios da CLI (`POST /api/v1/cli/runs`) deve rejeitar qualquer dado que contenha textos brutos de clientes, outputs da LLM, chaves de API expostas acidentalmente (detector de segredos → `422 PAYLOAD_CONTAINS_SECRET`) ou estruturas fora do formato esperado de metadados.
- **Token fora da URL:** O Project Token trafega **exclusivamente** no header `Authorization: Bearer <token>`. Nunca colocar tokens em path ou query string (eles vazam em logs de proxy/CDN).
- **Proteção contra Injection e Payload Gigante:** Limitar o tamanho máximo do corpo das requisições HTTP (`body-parser limit`) para evitar ataques de negação de serviço (DoS) via envio de relatórios com gigabytes de dados.

### 4.3 Rate Limiting & Proteção de Endpoint
- **Rate Limit na API:** Implementar limitação de taxa (Rate Limiting) em todos os endpoints públicos da API e do SaaS (especialmente no endpoint de recebimento de relatórios da CLI e rotas de login/cadastro) para evitar ataques de força bruta e abuso de requisições.
- **CORS Estrito:** Configurar políticas de CORS restritas no backend do SaaS, permitindo apenas requisições originadas do domínio oficial (`*.techtinker.com.br`) e bloqueando acessos genéricos de origens maliciosas.

### 4.4 Segurança no Pipeline de CI/CD (CLI)
- A CLI nunca deve imprimir chaves de API, senhas ou tokens sensíveis nos logs de saída do terminal ou do GitHub Actions (mascarar secrets automaticamente se necessário).
- Comunicação obrigatoriamente criptografada via **HTTPS / TLS 1.3** em todas as requisições entre a CLI e a API do SaaS. A CLI deve recusar `api_url` sem HTTPS (exceção apenas para `localhost` em desenvolvimento).
- O `promptcheck.yaml` é commitado no repositório do cliente: **jamais** escrever `PROMPTCHECK_TOKEN`, `OPENAI_API_KEY` ou qualquer segredo nele. Segredos vêm exclusivamente de variáveis de ambiente / secrets do CI. O comando `init` deve garantir que `.env` esteja no `.gitignore`.
- A API nunca deve logar o header `Authorization` nem cookies de sessão (configurar *redaction* no logger).