import { type Stats, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import type { CreateTestCaseInput } from '@promptcheck/shared';

export interface DiscoveredAiFile {
  /** Caminho relativo à raiz do projeto (ex: "./src/app/api/ai/compare-roadmaps/route.ts") */
  relativePath: string;
  /** Caminho absoluto no disco */
  absolutePath: string;
  /** Sugestão de slug em kebab-case */
  suggestedSlug: string;
  /** Código-fonte do arquivo */
  sourceCode: string;
  /** Prompt extraído em tempo real do código-fonte */
  extractedPrompt: string;
}

export interface GeneratedContractSpec {
  slug: string;
  name: string;
  description: string;
  source_file: string;
  model: string;
  response_format: 'json_object';
  schema: Record<string, unknown>;
  cases: CreateTestCaseInput[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.vercel',
  'venv',
  '.venv',
  '__pycache__',
  'playwright-report',
  'test-results',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.py']);

const LLM_CALL_PATTERNS = [
  /chat\.completions\.create/,
  /models\.generateContent/,
  /\bstreamText\s*\(/,
  /\bgenerateText\s*\(/,
  /\bgenerateObject\s*\(/,
  /\bSYSTEM_PROMPT\b/,
  /\bsystemPrompt\b/,
];

const PROMPT_ASSIGNMENT_REGEXES = [
  /(?:const|let|var)\s+(?:SYSTEM_PROMPT|systemPrompt|userPrompt|promptTemplate|basePrompt|instructions)\s*=\s*`([\s\S]*?)`/g,
  /(?:const|let|var)\s+(?:SYSTEM_PROMPT|systemPrompt|userPrompt|promptTemplate|basePrompt|instructions)\s*=\s*(['"])([\s\S]*?)\1/g,
  /(?:system_prompt|prompt|instructions)\s*=\s*f?"""([\s\S]*?)"""/g,
  /(?:system_prompt|prompt|instructions)\s*=\s*f?'''([\s\S]*?)'''/g,
];

function toKebabSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length >= 2 ? cleaned.slice(0, 80) : 'ai-contract';
}

function deriveSlugFromPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = normalized.split('/');
  const fileBase = basename(normalized, extname(normalized));

  if (fileBase === 'route' || fileBase === 'index' || fileBase === 'page') {
    const parent = parts[parts.length - 2] || 'ai-route';
    return toKebabSlug(parent);
  }
  return toKebabSlug(fileBase);
}

/**
 * Extrai em tempo real o texto do prompt diretamente de um arquivo de código (.ts, .js, .py)
 * e resolve interpolações de constantes locais ou variáveis de entrada.
 */
export function extractLivePromptFromSource(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Arquivo de código-fonte (source_file) não encontrado: ${filePath}`);
  }

  const code = readFileSync(filePath, 'utf-8');
  const extractedBlocks: string[] = [];

  // 1. Procura atribuições explícitas a variáveis de prompt (template literals TS/JS e docstrings Python)
  const backtickRegex =
    /(?:const|let|var)\s+(?:SYSTEM_PROMPT|systemPrompt|userPrompt|promptTemplate|basePrompt|instructions)\s*=\s*`([\s\S]*?)`/g;
  let match: RegExpExecArray | null = backtickRegex.exec(code);
  while (match !== null) {
    if (match[1] && match[1].trim().length > 20) {
      extractedBlocks.push(match[1].trim());
    }
    match = backtickRegex.exec(code);
  }

  // 2. Python triple-quoted strings (f"""...""" ou """...""")
  if (extractedBlocks.length === 0) {
    const pyRegex =
      /(?:system_prompt|prompt|instructions)\s*=\s*f?(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/g;
    let pyMatch: RegExpExecArray | null = pyRegex.exec(code);
    while (pyMatch !== null) {
      const content = (pyMatch[1] || pyMatch[2] || '').trim();
      if (content.length > 20) {
        extractedBlocks.push(content);
      }
      pyMatch = pyRegex.exec(code);
    }
  }

  // 3. Fallback: procura qualquer template literal longo (> 80 chars) dentro do arquivo que pareça instrução de IA
  if (extractedBlocks.length === 0) {
    const anyBacktick = /`([\s\S]{80,}?)`/g;
    let btMatch: RegExpExecArray | null = anyBacktick.exec(code);
    while (btMatch !== null) {
      const candidate = btMatch[1]?.trim() || '';
      if (
        candidate &&
        !candidate.includes('SELECT ') &&
        !candidate.includes(' className=') &&
        (candidate.includes('You are') ||
          candidate.includes('Você é') ||
          candidate.includes('JSON') ||
          candidate.includes('Regras') ||
          candidate.includes('schema'))
      ) {
        extractedBlocks.push(candidate);
      }
      btMatch = anyBacktick.exec(code);
    }
  }

  const rawPrompt = extractedBlocks.join('\n\n') || code.slice(0, 2000);

  // Converte expressões simples ${variavel} ou ${JSON.stringify(variavel...)} para {{variavel}}
  // e limpa ternários complexos em template literals
  const normalizedPrompt = rawPrompt
    .replace(/\$\{\s*JSON\.stringify\(\s*([a-zA-Z0-9_]+)\s*(?:,[^)]*)?\)\s*\}/g, '{{$1}}')
    .replace(/\$\{\s*([a-zA-Z0-9_]+)\s*\}/g, '{{$1}}')
    .replace(/\$\{[\s\S]*?\}/g, '');

  return normalizedPrompt.trim();
}

/**
 * Varre recursivamente o repositório em busca de arquivos de código que contêm prompts e chamadas de IA
 */
export function scanRepositoryForAiFiles(projectRoot: string): DiscoveredAiFile[] {
  const results: DiscoveredAiFile[] = [];
  const usedSlugs = new Set<string>();

  function walk(dir: string) {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry) || entry.startsWith('.')) continue;
      const fullPath = resolve(dir, entry);

      let stat: Stats;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const ext = extname(entry).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) {
        continue;
      }

      let code = '';
      try {
        code = readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const hasLlmCall = LLM_CALL_PATTERNS.some((rx) => rx.test(code));
      if (!hasLlmCall) continue;

      // Verifica se realmente existe um prompt substancial no arquivo
      const hasPromptText = PROMPT_ASSIGNMENT_REGEXES.some((rx) => {
        rx.lastIndex = 0;
        return rx.test(code);
      });

      const extractedPrompt = extractLivePromptFromSource(fullPath);
      if (!hasPromptText && extractedPrompt.length < 60) {
        continue;
      }

      const relPath = `./${relative(projectRoot, fullPath).replace(/\\/g, '/')}`;
      let slug = deriveSlugFromPath(relPath);
      if (usedSlugs.has(slug)) {
        const parentName = toKebabSlug(basename(dirname(fullPath)));
        slug = `${parentName}-${slug}`.slice(0, 80);
      }
      usedSlugs.add(slug);

      results.push({
        relativePath: relPath,
        absolutePath: fullPath,
        suggestedSlug: slug,
        sourceCode: code,
        extractedPrompt,
      });
    }
  }

  walk(projectRoot);
  return results;
}

/**
 * Usa a própria IA (OpenAI gpt-4o-mini) durante o `promptcheck init` / `scan`
 * para analisar o código-fonte do arquivo descoberto e gerar automaticamente:
 * - JSON Schema (Draft 2020-12) esperado pelo código
 * - Casos de teste sintéticos (Gold Dataset) + Asserções determinísticas
 */
export async function inferContractFromCodeWithAI(
  file: DiscoveredAiFile,
  apiKey: string
): Promise<GeneratedContractSpec> {
  const systemInstruction = `Você é um engenheiro especialista em testes de contrato de IA do PromptCheck.
Analise o código-fonte de um endpoint/serviço de IA fornecido pelo usuário e gere ESTRITAMENTE um objeto JSON válido contendo:
1. "name": Nome amigável em português para este contrato (ex: "Comparador de Cenários de Roadmap", máx 80 caracteres).
2. "description": Descrição curta em português do que este prompt/endpoint faz (máx 200 caracteres).
3. "schema": Um JSON Schema (Draft 2020-12) válido ("type": "object", "properties": {...}, "required": [...], "additionalProperties": false) que represente a estrutura JSON que o prompt/código espera que a LLM retorne.
   - Se o código já tiver um schema (como compareSchema, planRoadmapSchema ou um bloco \`\`\`json de exemplo no prompt), use exatamente esses campos no "schema"!
   - Se for um agente com tools ou chat, modele os campos principais da resposta estruturada esperada.
4. "cases": Array com 1 caso de teste sintético realista no formato:
   [
     {
       "id": "tc_auto_1",
       "name": "Nome do cenário de teste em português",
       "input": { "chave_variavel": "valor sintético de entrada" },
       "assertions": [
         { "type": "not_null", "path": "$.campo_obrigatorio" }
       ]
     }
   ]
   REGRAS CRÍTICAS PARA "assertions":
   - "type" DEVE ser apenas um destes: "equals", "not_null", "contains", "in_enum".
   - Se usar "not_null", envie APENAS { "type": "not_null", "path": "$.nome_do_campo" } (sem "value").
   - Se usar "equals", envie { "type": "equals", "path": "$.nome_do_campo", "value": ... } apenas quando o valor exato for 100% previsível pelo input. Prefira "not_null" ou "in_enum" para evitar falsos negativos!
   - Em "input", inclua todas as variáveis {{variavel}} presentes no prompt extraído.`;

  const userPayload = `Arquivo: ${file.relativePath}
Slug sugerido: ${file.suggestedSlug}

Prompt extraído do arquivo:
---
${file.extractedPrompt.slice(0, 3000)}
---

Código-fonte completo do arquivo:
---
${file.sourceCode.slice(0, 6000)}
---`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPayload },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const rawJson = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(rawJson) as {
        name?: string;
        description?: string;
        schema?: Record<string, unknown>;
        cases?: CreateTestCaseInput[];
      };

      if (parsed.schema && typeof parsed.schema === 'object') {
        const schemaWithDraft = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          ...parsed.schema,
        };

        const sanitizedCases: CreateTestCaseInput[] =
          Array.isArray(parsed.cases) && parsed.cases.length > 0
            ? parsed.cases.map((c, idx) => ({
                id: c.id || `tc_${file.suggestedSlug.replace(/-/g, '_')}_${idx + 1}`,
                name: c.name || `Caso Sintético ${idx + 1}`,
                input:
                  c.input && typeof c.input === 'object' ? c.input : { input: 'Teste automático' },
                assertions: Array.isArray(c.assertions)
                  ? c.assertions
                      .filter((a) => {
                        if (!a || typeof a !== 'object' || !a.type || !a.path) return false;
                        if (a.type === 'not_null') {
                          return true;
                        }
                        return 'value' in a;
                      })
                      .map((a) =>
                        a.type === 'not_null' ? { type: 'not_null' as const, path: a.path } : a
                      )
                  : [],
              }))
            : [
                {
                  id: `tc_${file.suggestedSlug.replace(/-/g, '_')}_1`,
                  name: 'Caso Sintético Padrão',
                  input: { prompt: 'Gere uma resposta de teste válida seguindo o schema.' },
                  assertions: [],
                },
              ];

        return {
          slug: file.suggestedSlug,
          name: (parsed.name || file.suggestedSlug).slice(0, 120),
          description: (
            parsed.description || `Contrato extraído automaticamente de ${file.relativePath}`
          ).slice(0, 1000),
          source_file: file.relativePath,
          model: 'gpt-4o-mini',
          response_format: 'json_object',
          schema: schemaWithDraft,
          cases: sanitizedCases,
        };
      }
    }
  } catch {
    // Fallback determinístico caso a chamada de inferência falhe
  }

  return {
    slug: file.suggestedSlug,
    name: `Contrato — ${file.suggestedSlug}`,
    description: `Contrato vinculado automaticamente ao arquivo ${file.relativePath}`,
    source_file: file.relativePath,
    model: 'gpt-4o-mini',
    response_format: 'json_object',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    },
    cases: [
      {
        id: `tc_${file.suggestedSlug.replace(/-/g, '_')}_1`,
        name: 'Validação Estrutural de JSON',
        input: { input: 'Gere uma resposta estruturada em JSON para validação de contrato.' },
        assertions: [],
      },
    ],
  };
}
