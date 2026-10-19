# Documento de Requisitos de Software (DRS)

## Produto: PromptCheck (SaaS de Testes, Regressão e Governança de Prompts para LLMs)

> [!IMPORTANT]
> As decisões técnicas posteriores a este documento estão em [arquitetura.md](./arquitetura.md), que **prevalece** em caso de divergência. Pontos daqui que foram atualizados: nomenclatura (`prompt-contract` → `promptcheck`), rotas da CLI (token sai da URL e vai para o header `Bearer`), modelo de dados (usuários, versionamento de contratos, resultados por contrato) e definição de drift.

---

## 1. Visão Geral do Produto

O **PromptCheck** é uma ferramenta voltada para equipes de engenharia que integram Inteligência Artificial em backends. O produto resolve dois grandes problemas:

1. **Regressão de Código/Prompt:** Evitar que alterações manuais em prompts quebrem o contrato estrutural (ex: formato do JSON de saída) consumido pela aplicação.
2. **Drift Detection (Deriva por Atualização de Modelo):** Identificar de forma proativa se atualizações silenciosas das provedoras de IA (OpenAI, Anthropic, Google) alteraram o comportamento ou a precisão do modelo em produção.

### Arquitetura de Execução (Modelo Híbrido)

* **Control Plane (Seu SaaS):** Backend API, Banco de Dados (PostgreSQL) e Dashboard Web (para histórico, métricas e gestão de contratos).
* **Execution Plane (CLI / Runner Local):** Pacote executável leve que roda na máquina do desenvolvedor ou no pipeline de CI/CD (GitHub Actions/GitLab CI), utilizando a chave de API própria do cliente para executar os testes e enviando apenas metadados/relatórios consolidados para a nuvem.

---

## 2. Escopo do MVP (O que será construído)

### Módulo 1: O Dashboard Web (Control Plane)

* Autenticação simples de usuários (Email/Senha ou OAuth).
* Gestão de **Projetos** e geração de *Project Tokens*.
* Tela de criação de **Contratos de Prompt**:
* Definição do nome do prompt e ID.
* Inserção do **JSON Schema** esperado na resposta.
* Cadastro de **Casos de Teste (Gold Dataset)**: Entrada de texto/payload + Comportamento esperado.


* Tela de **Relatórios e Histórico**:
* Listagem de execuções (Runs) recebidas via CLI/CI.
* Visualização de métricas: Taxa de Sucesso (Pass/Fail), Latência Média, Custo Estimado e Campos que quebraram.
* Comparativo simples entre execuções (Diff de versões).



### Módulo 2: A CLI (Execution Plane / Local Runner)

* Desenvolvida em **Node.js/TypeScript** (para rodar via `npx` sem instalação complexa) ou **Python**.
* Comandos principais:
* `prompt-contract init`: Cria o arquivo de configuração inicial (`prompt-contract.yaml`) no repositório do cliente.
* `prompt-contract test`: Lê o arquivo de configuração, busca o contrato remoto na API do SaaS (usando o Token), dispara as chamadas em paralelo para a LLM (usando `OPENAI_API_KEY` do ambiente local), valida o retorno contra o JSON Schema usando bibliotecas padrão e envia o relatório consolidado de volta para o SaaS.



---

## 3. Requisitos Funcionais (RF)

| ID | Requisito | Descrição | Prioridade |
| --- | --- | --- | --- |
| **RF01** | Gestão de Contratos | O usuário deve conseguir cadastrar e editar na interface web um esquema de validação (JSON Schema) associado a um conjunto de casos de teste. | Alta |
| **RF02** | Execução Local via CLI | A CLI deve ser capaz de ler o arquivo de configuração local, disparar as requisições para a API do provedor de IA e validar os resultados localmente. | Alta |
| **RF03** | Validação Estrutural (Schema) | O motor de teste deve validar automaticamente se o JSON retornado pela LLM atende estritamente às regras de tipagem e campos obrigatórios definidos no contrato. | Alta |
| **RF04** | Envio de Relatórios (Telemetry) | A CLI deve enviar um payload JSON contendo apenas metadados (status, latência, tokens, erros de schema) para a API do SaaS, sem expor dados confidenciais de clientes. | Alta |
| **RF05** | Bloqueio de CI/CD (Exit Code) | A CLI deve retornar um código de saída (`exit code 1`) caso a taxa de sucesso fique abaixo do limiar estipulado (`--fail-under`), travando o Pull Request no GitHub Actions. | Média |
| **RF06** | Dashboard de Histórico | O SaaS deve exibir o histórico cronológico das execuções de testes agrupadas por branch e commit do Git. | Média |

---

## 4. Requisitos Não-Funcionais (RNF)

| ID | Requisito | Descrição |
| --- | --- | --- |
| **RNF01** | Privacidade e Segurança | O SaaS **não** deve armazenar chaves de API de provedores de IA de terceiros e nem reter payloads brutos de dados de teste enviados pelos clientes. |
| **RNF02** | Desempenho da CLI | A CLI deve suportar execução assíncrona/paralela de múltiplos casos de teste para otimizar o tempo de feedback no pipeline. |
| **RNF03** | Compatibilidade de Provedores | O motor de execução inicial deve suportar chamadas para as APIs da OpenAI (e compatíveis com formato OpenAI). |
| **RNF04** | Escalabilidade do Control Plane | O backend do SaaS deve ser leve, projetado para receber requisições HTTP REST provenientes de milhares de execuções diárias de CI/CD sem gargalos de CPU. |

---

## 5. Modelo de Dados Inicial (PostgreSQL - Control Plane)

### Tabela: `projects`

* `id` (UUID, Primary Key)
* `name` (String)
* `project_token` (String, Unique - Usado pela CLI)
* `created_at` (Timestamp)

### Tabela: `contracts`

* `id` (UUID, Primary Key)
* `project_id` (UUID, Foreign Key)
* `prompt_name` (String)
* `json_schema` (JSONB - O contrato estrutural esperado)
* `test_cases` (JSONB - Lista de entradas de teste e comportamentos)
* `created_at` (Timestamp)
* `updated_at` (Timestamp)

### Tabela: `test_runs`

* `id` (UUID, Primary Key)
* `project_id` (UUID, Foreign Key)
* `branch` (String)
* `commit_sha` (String)
* `total_cases` (Integer)
* `passed_cases` (Integer)
* `failed_cases` (Integer)
* `avg_latency_ms` (Integer)
* `total_cost_usd` (Numeric)
* `raw_report_metadata` (JSONB - Detalhes dos erros por campo, sem dados sensíveis)
* `executed_at` (Timestamp)

---

## 6. Prompt Orientador para o Antigravity + Argon

Quando for alimentar o ambiente de desenvolvimento com o **Antigravity** e o **Argon**, você pode utilizar o seguinte comando mestre ou *prompt estrutural* para iniciar a geração do código:

> *"Atue como um Arquiteto de Software Sênior especializado em Developer Tools (DX), microsserviços e engenharia de confiabilidade. Vamos iniciar o desenvolvimento do MVP do "PromptCheck", uma ferramenta de governança, testes de contratos e detecção de regressão/drift para prompts de Inteligência Artificial, operando sob o ecossistema da TechTinker.

A arquitetura do produto é HÍBRIDA (Split-Plane), dividida em:
1. Control Plane (SaaS Dashboard & API): Responsável por gerenciar projetos, armazenar esquemas de contratos (JSON Schema), casos de teste (Gold Dataset) e receber relatórios de execução.
2. Execution Plane (CLI / Local Runner): Um pacote executável leve que roda na máquina do desenvolvedor ou no pipeline de CI/CD (GitHub Actions), utilizando a chave de API própria do cliente para executar os testes e enviando apenas os metadados consolidados para o SaaS.

Preciso que você estruture o esqueleto inicial do projeto focando nos seguintes pilares fundamentais:

1. MODELAGEM DO BANCO DE DADOS (Control Plane - PostgreSQL):
- Tabela `projects`: id (UUID), name (String), project_token (String unique), created_at.
- Tabela `contracts`: id (UUID), project_id (FK), prompt_name (String), json_schema (JSONB), test_cases (JSONB), created_at, updated_at.
- Tabela `test_runs`: id (UUID), project_id (FK), branch (String), commit_sha (String), total_cases (Int), passed_cases (Int), failed_cases (Int), avg_latency_ms (Int), total_cost_usd (Numeric), raw_report_metadata (JSONB), executed_at.

2. API REST DO CONTROL PLANE (Backend):
- Endpoint GET /api/v1/projects/{token}/contract: Valida o token do projeto e retorna o JSON Schema e os casos de teste para a CLI.
- Endpoint POST /api/v1/projects/{token}/runs: Recebe o payload consolidado enviado pela CLI contendo o resumo dos testes (status, latência, erros por campo) e salva na tabela `test_runs`. NENHUM dado bruto de cliente ou chave de API deve ser armazenado.

3. MOTOR DA CLI (Execution Plane - TypeScript/Node.js):
- Estrutura básica para ler um arquivo de configuração local (ex: prompt-contract.yaml).
- Lógica para buscar o contrato remoto na API do SaaS usando o Project Token.
- Motor de disparo assíncrono de chamadas para o provedor de IA (OpenAI / compatíveis) utilizando a OPENAI_API_KEY do ambiente local do cliente.
- Validação determinística do JSON retornado contra o JSON Schema do contrato (ex: usando ajv ou validação nativa equivalente).
- Envio do relatório final de metadados para a API do SaaS e saída com código de erro (exit code 1) caso a taxa de sucesso falhe no limiar definido.

Siga rigorosamente o princípio de "Clareza antes do código", mantenha a modularidade limpa, use tipagem forte e estruture os diretórios de forma organizada para facilitar a evolução do MVP."*

---

