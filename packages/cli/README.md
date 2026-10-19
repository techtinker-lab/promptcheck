# @techtinker/promptcheck (CLI)

> **PromptCheck CLI** — Execution Plane for prompt contract testing, regression prevention, and model drift detection.

[![npm version](https://img.shields.io/npm/v/@techtinker/promptcheck.svg)](https://www.npmjs.com/package/@techtinker/promptcheck)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

---

## 🚀 Quick Start

Run the interactive wizard inside your repository:

```bash
npx @techtinker/promptcheck init
```

This generates:
- `promptcheck.yaml` — Root configuration mapping your contracts, prompt templates, and models.
- `src/prompts/exemplo.txt` — Starter prompt template with template variable placeholders.
- `.github/workflows/promptcheck.yml` — Automated CI pipeline with scheduled cron for silent drift monitoring.
- Adds `.env` to `.gitignore` to prevent secret leaks.

---

## 🔑 Environment Variables

The CLI never reads secrets from YAML files. Configure them via environment variables:

| Variable | Description |
|---|---|
| `PROMPTCHECK_TOKEN` | Project Token generated in the SaaS Control Plane (`pck_live_...`). Required to sync contracts and report run telemetry. |
| `OPENAI_API_KEY` | OpenAI API key. Used directly by the CLI to query OpenAI without passing through any third-party intermediary. |

---

## ⚙️ Configuration (`promptcheck.yaml`)

```yaml
version: 1
project: "meu-sistema-ia"

defaults:
  provider: "openai"
  model: "gpt-4o-mini"
  temperature: 0.0
  response_format: "json_object"
  concurrency: 5
  fail_under: 100 # Minimum pass rate percentage required for exit code 0

contracts:
  - slug: "extrator-nota-fiscal"
    prompt_file: "./src/prompts/extrator-nf.txt"
    model: "gpt-4o-mini"
    temperature: 0.0
    response_format: "json_object"
```

---

## 🧪 Running Tests

```bash
# Run all contracts defined in promptcheck.yaml
npx @techtinker/promptcheck test

# Run a specific contract by slug
npx @techtinker/promptcheck test --slug=extrator-nota-fiscal

# Specify execution branch and trigger
npx @techtinker/promptcheck test --branch=main --trigger=ci

# Run in offline mode (local validation against local fixtures without SaaS sync)
npx @techtinker/promptcheck test --offline

# Multi-language support (pt-BR or en-US)
npx @techtinker/promptcheck test --lang=pt
```

---

## 🔒 Privacy by Design & LGPD

- **Zero LLM Outputs in SaaS:** Raw outputs from the LLM never leave your local environment or CI runner.
- **Zero Prompt Texts in SaaS:** Prompts remain in your private git repository. Only a SHA-256 `prompt_hash` is sent to detect prompt code changes.
- **Privacy-Preserving Diffs:** Contract validation failures expose strictly engineering metadata (`json_path`, `rule_violated`, `expected_type`, `received_type`).
- **Anonymized Git Telemetry:** Commit author captures only public usernames/handles (`git config user.name`), discarding emails to protect developer privacy.
