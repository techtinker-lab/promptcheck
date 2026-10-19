# Guia de UI/UX e Identidade Visual — PromptCheck (TechTinker)

## 1. Princípios de Design (The "Dev-First" Aesthetic)

Ferramentas voltadas para desenvolvedores e engenheiros (como Vercel, Supabase, Linear e GitHub) não precisam de floreios visuais, mas exigem **densidade de informação limpa, feedback instantâneo e alta velocidade de leitura**.

* **Estética de Dark Mode Nativo:** Como alinhado ao padrão da TechTinker, o produto deve priorizar temas escuros por padrão (`slate-900`, `zinc-950`, tons profundos de azul/preto) com contrastes precisos para destacar estados de sucesso e erro.
* **Sem Fofura, Foco em Dados:** Evite ilustrações infantis, avatares genéricos ou espaços vazios vazios. Use tabelas limpas, badges de status bem definidos e tipografia monoespada (`JetBrains Mono` ou `Fira Code`) para trechos de código, hashes de commit e payloads JSON.
* **Hierarquia Visual Direta:** O usuário precisa bater o olho no dashboard e responder a uma pergunta em 3 segundos: *"O contrato quebrou ou passou?"* (Verde para sucesso total, Vermelho para falha crítica, Amarelo para alerta de drift).

---

## 2. Diretrizes de UX (User Experience) para o SaaS

### A. Fluxo de Onboarding sem Fricção

* **Zero configuração obrigatória na primeira tela:** Assim que o usuário faz login, a primeira coisa que ele vê não é um painel vazio sem graça, mas sim um guia interativo de 3 passos para rodar a primeira CLI:
1. *Copiar o comando de instalação (`npx @techtinker/promptcheck init`).*
2. *Definir a chave de API local.*
3. *Rodar o primeiro teste.*


* **Feedback Imediato na CLI:** Quando a CLI roda no terminal, a barra de progresso e as cores devem ser idênticas às ferramentas modernas (ex: Vitest ou Jest), mostrando claramente quais casos de teste passaram e quais falharam antes mesmo de atualizar o Dashboard na web.

### B. O Dashboard de Relatórios (O Coração do Produto)

* **Visualização de Diff Lado a Lado:** Quando um teste falha ou sofre drift, a interface web deve exibir de forma clara e visual o erro de contrato (ex: campo esperado vs. campo recebido), permitindo que o desenvolvedor identifique o problema sem precisar caçar logs perdidos.
* **Badges de Contexto do Git:** Cada execução de teste deve vir acompanhada do autor do commit, branch e o hash curto do Git, criando uma trilha de auditoria natural.

---

## 3. Diretrizes de UI (Componentes e Cores)

* **Paleta de Cores Base:**
* **Backgrounds:** `bg-zinc-950` / `bg-slate-900`
* **Bordas & Divisores:** `border-zinc-800` (sutis, sem alto contraste agressivo).
* **Textos:** Primário em `text-zinc-100`, Secundário em `text-zinc-400`.


* **Cores de Estado (Feedback):**
* **Sucesso (Pass):** Verde esmeralda (`text-emerald-400`, `bg-emerald-950/40`, `border-emerald-800`)
* **Erro Crítico (Fail):** Vermelho rosado (`text-rose-400`, `bg-rose-950/40`, `border-rose-800`)
* **Alerta / Drift (Warning):** Âmbar / Laranja (`text-amber-400`, `bg-amber-950/40`, `border-amber-800`)


* **Tipografia:**
* **Títulos e Textos Gerais:** Sans-serif moderna (`Inter` ou `Geist Sans`).
* **Blocos de Código, Schemas JSON, Tokens e Terminais:** `font-mono` (`JetBrains Mono`).



---

---

## 4. Bloco Pronto para o `agents.md`

Copie o bloco abaixo e cole no arquivo **`agents.md`** do seu projeto. Isso instruirá o Antigravity/Argon (ou qualquer outra IA gerando código para você) a seguir rigorosamente estas diretrizes de UI/UX em todas as telas e componentes criados:

```markdown
## UI/UX & Design Guidelines (PromptCheck / TechTinker)

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

```