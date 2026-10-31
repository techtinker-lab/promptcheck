# @techtinker/promptcheck

> **Open Source CLI for LLM Prompt Contract Testing, Live Code Binding (`source_file`) & Silent Model Drift Detection.**

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)

O **`@techtinker/promptcheck`** testa seus prompts de IA diretamente a partir do código-fonte real da sua aplicação (`.ts`, `.tsx`, `.js`, `.py`), sem que você precise duplicar textos de prompts ou manter arquivos de teste manualmente.

---

## ✨ Destaques

- **🔍 AI Auto-Discovery (`promptcheck scan`)**: Escaneia seu repositório automaticamente, encontra arquivos que chamam `openai`, `@google/genai`, `anthropic`, `ai`, `langchain` e gera contratos JSON Schema + casos de teste sintéticos sozinho.
- **🔗 Live Code Binding (`source_file`)**: Aponte para `./src/lib/aiService.ts` no `promptcheck.yaml`. Sempre que você editar o prompt no código da aplicação, o `promptcheck test` lê o código ao vivo — **zero manutenção dupla**.
- **🏠 100% Standalone & Local-First**: Funciona imediatamente sem precisar de servidor externo. Salva o baseline em `.promptcheck/baseline.json` e detecta `FINGERPRINT_CHANGED`, `PASS_RATE_DROPPED` e `LATENCY_INCREASED`.
- **☁️ Self-Hosted Dashboard Opcional**: Conecte ao Control Plane Open Source do PromptCheck para visualizar histórico de runs e gráficos em equipe.

---

## 🚀 Uso Rápido (Zero-Config)

```bash
# 1. Escaneie seu projeto e gere o promptcheck.yaml automaticamente
npx @techtinker/promptcheck scan

# 2. Execute os testes de contrato (lê OPENAI_API_KEY do ambiente ou .env.local)
npx @techtinker/promptcheck test
```

---

## 📄 Exemplo de `promptcheck.yaml` com `source_file`

```yaml
version: 1
project: meu-app
defaults:
  provider: openai
  model: gpt-4o-mini
  temperature: 0
  response_format: json_object
  fail_under: 95

contracts:
  - slug: copiloto-roteador
    name: Copiloto Roteador de Tools
    source_file: ./src/services/aiRouter.ts
    schema:
      type: object
      properties:
        tool_name:
          type: string
        commit:
          type: boolean
      required:
        - tool_name
        - commit
      additionalProperties: false
    cases:
      - name: Caso padrão
        input:
          comando: "Recomende 3 formatos para 4h e 2 quadras"
        assertions:
          - type: not_empty
            path: $.tool_name
```

---

## 📄 Licença

MIT © TechTinker
